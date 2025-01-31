import { ResponseDto } from '@interface/config/app.config'
import { GetProfileDtoOut } from '@interface/dto/profile/profile.dto-out'
import { StatustoOut } from '@interface/config/app.config'
import {
	Controller,
	Delete,
	Get,
	Patch,
	Post,
	Put,
	Request,
	UseGuards,
	BadRequestException,
	Body,
	Query,
} from '@nestjs/common'
import { AuthGuard } from 'src/core/auth.guard'
import { mockUM } from './mock-um'
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm'
import { RegionsEntity, UsersEntity } from '@interface/entities'
import { Repository, EntityManager, In, Not } from 'typeorm'
import { errorResponse } from '@interface/config/error.config'
import {
	DeleteUserDtoOut,
	GetUserDtoOut,
	PostUserDtoOut,
	PutUserDtoOut,
	SearchUserDtoOut,
} from '@interface/dto/um/um.dto-out'
import {
	DeleteUserDtoIn,
	GetUserDtoIn,
	PostUserDtoIn,
	PutUserDtoIn,
	SearchUserDtoIn,
} from '@interface/dto/um/um.dto.in'
import { User } from 'src/core/user.decorator'
import { UserMeta } from '@interface/auth.type'
import { hashPassword } from 'src/core/utils'
import { RandomService } from 'src/core/random.service'
@Controller('um')
export class UMController {
	constructor(
		private readonly randomService: RandomService,

		@InjectEntityManager()
		private readonly entityManager: EntityManager,

		@InjectRepository(UsersEntity)
		private readonly userEntity: Repository<UsersEntity>,
	) {}

	@Get('/search')
	@UseGuards(AuthGuard)
	async search(@Query() query: SearchUserDtoIn): Promise<ResponseDto<SearchUserDtoOut[]>> {
		// return new ResponseDto({ data: [] })
		const queryBuilder = this.userEntity
			.createQueryBuilder('users')
			.select([
				'users.userId',
				'users.firstName',
				'users.lastName',
				'users.email',
				'users.phone',
				'users.isActive',
			])
			.leftJoinAndSelect('users.role', 'role')
			.leftJoinAndSelect('users.position', 'position')
			.leftJoinAndSelect('users.region', 'region')
		if (query.keyword) {
			queryBuilder.andWhere(
				`(users.firstName ILIKE :keyword OR users.lastName ILIKE :keyword OR users.phone ILIKE :keyword OR users.email ILIKE :keyword)`,
				{ keyword: `%${query.keyword}%` },
			)
		}
		if (query.position) {
			const positionIdsArray = Array.isArray(query.position) ? query.position : [query.position]
			queryBuilder.andWhere('position.positionId IN (:...positionIds)', {
				positionIds: positionIdsArray,
			})
		}
		if (query.region) {
			const regionIdsArray = Array.isArray(query.region) ? query.region : [query.region]
			queryBuilder.andWhere('region.regionId IN (:...regionIds)', {
				regionIds: regionIdsArray,
			})
		}
		if (query.role) {
			const roleIdsArray = Array.isArray(query.role) ? query.role : [query.role]
			queryBuilder.andWhere('role.roleId IN (:...roleIds)', {
				roleIds: roleIdsArray,
			})
		}
		console.log('query', query)
		queryBuilder.skip((Number(query.page) - 1) * Number(query.limit)).take(Number(query.limit))
		if (query.orderBy || query.order) {
			const relacolumns = ['region', 'position', 'role']
			const relations = relacolumns.find((item) => query.orderBy.includes(item))
			queryBuilder.orderBy(`${relations ? query.orderBy : `users.${query.orderBy}`}`, query.order)
		}

		const [data, total] = await queryBuilder.getManyAndCount()
		console.log('query', query)
		return new ResponseDto({ data: data, total: total })
	}

	@Post()
	@UseGuards(AuthGuard)
	async post(@Body() payload: PostUserDtoIn, @User() user: UserMeta): Promise<ResponseDto<PostUserDtoOut>> {
		let newUserId = null
		const cnt = await this.userEntity.countBy({ email: payload.email, isDeleted: false })
		if (cnt > 0) throw new BadRequestException(errorResponse.USER_EMAIL_DUPLICATED)
		await this.entityManager.transaction(async (transactionalEntityManager) => {
			const newPassword = this.randomService.generateSixDigitString()

			const newUser = transactionalEntityManager.create(UsersEntity, payload)
			newUser.createdBy = user?.id
			newUser.updatedBy = user?.id
			newUser.createdAt = new Date()
			newUser.updatedAt = new Date()
			newUser.password = await hashPassword(newPassword)
			await transactionalEntityManager.save(newUser)
			newUserId = newUser.userId
			if (payload.regions.length > 0) {
				const regions = await transactionalEntityManager.findBy(RegionsEntity, {
					regionId: In(payload.regions),
				})
				newUser.regions = regions
				await transactionalEntityManager.save(newUser)
			}

			// await this.mailService.sendUserAccountCreated(payload.email, payload.name, newPassword)
		})

		return new ResponseDto({ data: { id: newUserId } })
	}

	@Get('/:userId')
	@UseGuards(AuthGuard)
	async get(@Request() req): Promise<ResponseDto<GetProfileDtoOut>> {
		const params: GetUserDtoIn = req.params
		const result: GetUserDtoOut[] = await this.userEntity
			.createQueryBuilder('users')
			.select([
				'users.userId',
				'users.firstName',
				'users.lastName',
				'users.email',
				'users.phone',
				'users.isActive',
			])
			.leftJoinAndSelect('users.role', 'role')
			.leftJoinAndSelect('users.regions', 'regions')
			.leftJoinAndSelect('users.position', 'position')
			.leftJoinAndSelect('users.region', 'region')
			.leftJoinAndSelect('users.province', 'province')
			.where({ userId: params.userId })
			.getMany()
		if (result.length === 0) throw new BadRequestException(errorResponse.USER_NOT_FOUND)
		return new ResponseDto({ data: result[0] as any })
	}

	@Put('/:userId')
	@UseGuards(AuthGuard)
	async put(@Request() req, @User() user: UserMeta): Promise<ResponseDto<PutUserDtoOut>> {
		const userId = req.params.userId
		const payload: PutUserDtoIn = req.body
		const existingUser = await this.userEntity.findOne({
			where: { userId, isDeleted: false },
			relations: ['regions'],
		})
		if (!existingUser) throw new BadRequestException(errorResponse.USER_NOT_FOUND)
		await this.entityManager.transaction(async (transactionalEntityManager) => {
			Object.assign(existingUser, payload)
			existingUser.updatedBy = user?.id
			existingUser.updatedAt = new Date()
			if (payload.regions) {
				const regions = await transactionalEntityManager.findBy(RegionsEntity, {
					regionId: In(payload.regions),
				})
				existingUser.regions = regions
			}
			await transactionalEntityManager.save(existingUser)
		})
		return new ResponseDto({ data: { id: userId } })
	}

	@Patch('/:userId')
	@UseGuards(AuthGuard)
	async patch(@Request() req, @User() user: UserMeta): Promise<ResponseDto<StatustoOut>> {
		return new ResponseDto({ data: { success: true } })
	}

	@Delete('/:userId')
	@UseGuards(AuthGuard)
	async delete(@Request() req, @User() user: UserMeta): Promise<ResponseDto<DeleteUserDtoOut>> {
		const params: DeleteUserDtoIn = req.params
		const existingUser = await this.userEntity.findOne({
			where: { userId: params.userId, isDeleted: false },
		})
		if (!existingUser) throw new BadRequestException(errorResponse.USER_NOT_FOUND)
		await this.entityManager.transaction(async (transactionalEntityManager) => {
			existingUser.isDeleted = true
			existingUser.updatedBy = user?.id
			existingUser.updatedAt = new Date()

			// บันทึกข้อมูลใหม่
			await transactionalEntityManager.save(existingUser)
		})

		return new ResponseDto({ data: { id: params.userId } })
	}

	// @Post('/import/xlsx')
	// @UseGuards(AuthGuard)
	// async postImportXlsx(): Promise<ResponseDto<StatustoOut>> {
	// 	return new ResponseDto({ data: { success: true } })
	// }

	@Post('/import/csv')
	@UseGuards(AuthGuard)
	async postImportCsv(): Promise<ResponseDto<StatustoOut>> {
		return new ResponseDto({ data: { success: true } })
	}

	@Post('/import/template')
	@UseGuards(AuthGuard)
	async getImportTemplate() {
		return new ResponseDto({ data: {} })
	}
}
