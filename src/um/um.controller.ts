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
	UseInterceptors,
	UploadedFile,
	Res,
} from '@nestjs/common'
import { AuthGuard } from 'src/core/auth.guard'
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm'
import { RegionsEntity, UsersEntity } from '@interface/entities'
import { Repository, EntityManager, In } from 'typeorm'
import { errorResponse } from '@interface/config/error.config'
import {
	DeleteImageUserDtoOut,
	DeleteUserDtoOut,
	GetUserDtoOut,
	PostImageUserDtoOut,
	PostUserDtoOut,
	PutUserDtoOut,
	SearchUserDtoOut,
} from '@interface/dto/um/um.dto-out'
import {
	DeleteImageUserDtoIn,
	DeleteUserDtoIn,
	GetImageUserDtoIn,
	GetUserDtoIn,
	PostImageUserDtoIn,
	PostUserDtoIn,
	PutUserDtoIn,
	SearchUserDtoIn,
} from '@interface/dto/um/um.dto.in'
import { User } from 'src/core/user.decorator'
import { UserMeta } from '@interface/auth.type'
import { hashPassword, validatePayload } from 'src/core/utils'
import { RandomService } from 'src/core/random.service'
import { MailService } from 'src/core/mail.service'
import { FileInterceptor } from '@nestjs/platform-express'
@Controller('um')
export class UMController {
	constructor(
		private readonly randomService: RandomService,
		private readonly mailService: MailService,

		@InjectEntityManager()
		private readonly entityManager: EntityManager,

		@InjectRepository(UsersEntity)
		private readonly userEntity: Repository<UsersEntity>,
	) {}

	@Get('/search')
	@UseGuards(AuthGuard)
	async search(@Query() query: SearchUserDtoIn): Promise<ResponseDto<SearchUserDtoOut[]>> {
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
			.addSelect("CONCAT(users.firstName, ' ', users.lastName)", 'fullname')
			.leftJoinAndSelect('users.role', 'role')
			.leftJoinAndSelect('users.position', 'position')
			.leftJoinAndSelect('users.region', 'region')
		if (query.keyword) {
			const keywords = query.keyword.trim().split(/\s+/)
			const conditions = keywords
				.map(
					(_, index) => `
				users.first_name ILIKE :keyword${index} 
				OR users.last_name ILIKE :keyword${index} 
				OR users.phone ILIKE :keyword${index} 
				OR users.email ILIKE :keyword${index}
			`,
				)
				.join(' OR ')

			const params = keywords.reduce(
				(acc, word, index) => {
					acc[`keyword${index}`] = `%${word}%`
					return acc
				},
				{} as Record<string, string>,
			)

			queryBuilder.andWhere(`(${conditions})`, params)
		}
		if (query.position) {
			queryBuilder.andWhere('position.positionId IN (:...positionIds)', {
				positionIds: validatePayload(query.position),
			})
		}
		if (query.region) {
			queryBuilder.andWhere('region.regionId IN (:...regionIds)', {
				regionIds: validatePayload(query.region),
			})
		}
		if (query.role) {
			queryBuilder.andWhere('role.roleId IN (:...roleIds)', {
				roleIds: validatePayload(query.role),
			})
		}
		if (query.orderBy && query.order) {
			if (query.orderBy === 'user_fullname') {
				queryBuilder.orderBy("CONCAT(users.firstName, ' ', users.lastName)", query.order)
			} else {
				queryBuilder.orderBy(query.orderBy, query.order)
			}
		}
		if (query.page && query.limit) {
			queryBuilder.offset((Number(query.page) - 1) * Number(query.limit)).limit(Number(query.limit))
		}
		const [data, total] = await Promise.all([queryBuilder.getRawMany(), queryBuilder.getCount()])

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
			newUser.createdBy = { userId: user.id }
			newUser.updatedBy = { userId: user.id }
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

			await this.mailService.sendUserAccountCreated(payload.email, payload.firstName, newPassword)
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
			existingUser.updatedBy = { userId: user.id }
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
			existingUser.updatedBy = { userId: user.id }
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

	@Get('/img/:userId')
	// @UseGuards(AuthGuard)
	async getImage(@Request() req, @Res() res) {
		const params: GetImageUserDtoIn = req.params
		const existingUser = await this.userEntity.findOne({
			where: { userId: params.userId, isDeleted: false },
		})
		if (!existingUser) throw new BadRequestException(errorResponse.USER_NOT_FOUND)
		if (!existingUser.img) {
			throw new BadRequestException(errorResponse.USER_IMG_NOT_FOUND)
		}
		res.setHeader('Content-Type', 'image/png')
		const imageBuffer = Buffer.from(existingUser.img, 'base64')
		return res.send(imageBuffer)
	}

	@Post('/img/:userId')
	@UseGuards(AuthGuard)
	@UseInterceptors(FileInterceptor('file'))
	async postImage(
		@UploadedFile() file: Express.Multer.File,
		@Request() req,
		@User() user: UserMeta,
	): Promise<ResponseDto<PostImageUserDtoOut>> {
		const params: PostImageUserDtoIn = req.params
		if (!file) {
			throw new BadRequestException(errorResponse.NO_FILE_UPLOAD)
		}
		const base64Image = file.buffer.toString('base64')
		const existingUser = await this.userEntity.findOne({
			where: { userId: params.userId, isDeleted: false },
		})
		if (!existingUser) throw new BadRequestException(errorResponse.USER_NOT_FOUND)
		await this.entityManager.transaction(async (transactionalEntityManager) => {
			existingUser.img = base64Image
			existingUser.updatedBy = { userId: user.id }
			existingUser.updatedAt = new Date()
			await transactionalEntityManager.save(existingUser)
		})
		return new ResponseDto({
			data: {
				id: params.userId,
			},
		})
	}

	@Delete('/img/:userId')
	@UseGuards(AuthGuard)
	async deleteImage(@Request() req, @User() user: UserMeta): Promise<ResponseDto<DeleteImageUserDtoOut>> {
		const params: DeleteImageUserDtoIn = req.params
		const existingUser = await this.userEntity.findOne({
			where: { userId: params.userId, isDeleted: false },
		})
		if (!existingUser) throw new BadRequestException(errorResponse.USER_NOT_FOUND)
		if (!existingUser.img) {
			throw new BadRequestException(errorResponse.USER_IMG_NOT_FOUND)
		}
		await this.entityManager.transaction(async (transactionalEntityManager) => {
			existingUser.img = null
			existingUser.updatedBy = { userId: user.id }
			existingUser.updatedAt = new Date()
			await transactionalEntityManager.save(existingUser)
		})

		return new ResponseDto({
			data: {
				id: user.id,
			},
		})
	}
}
