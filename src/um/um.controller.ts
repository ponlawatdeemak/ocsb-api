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
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common'
import { AuthGuard } from 'src/core/auth.guard'
import { mockUM } from './mock-um'
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm'
import { PositionEntity, ProvincesEntity, RegionsEntity, RolesEntity, UsersEntity } from '@interface/entities'
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
import { FileInterceptor } from '@nestjs/platform-express'
import * as XLSX from 'xlsx'
import { importUserTemplate, ImportValidatorType } from '@interface/config/um.config'

@Controller('um')
export class UMController {
	constructor(
		private readonly randomService: RandomService,

		@InjectEntityManager()
		private readonly entityManager: EntityManager,

		@InjectRepository(UsersEntity)
		private readonly userEntity: Repository<UsersEntity>,

		@InjectRepository(RegionsEntity)
		private readonly repoRegions: Repository<RegionsEntity>,

		@InjectRepository(PositionEntity)
		private readonly repoPosition: Repository<PositionEntity>,

		@InjectRepository(ProvincesEntity)
		private readonly repoProvinces: Repository<ProvincesEntity>,

		@InjectRepository(RolesEntity)
		private readonly repoRoles: Repository<RolesEntity>,
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

	// @Post('/import/csv')
	// @UseGuards(AuthGuard)
	// async postImportCsv(): Promise<ResponseDto<StatustoOut>> {
	// 	return new ResponseDto({ data: { success: true } })
	// }

	@Post('/import/csv')
	@UseGuards(AuthGuard)
	@UseInterceptors(FileInterceptor('file'))
	async postImportCsv(@User() user: UserMeta, @UploadedFile() file: Express.Multer.File): Promise<ResponseDto<any>> {
		const userId = user.id

		console.log('userId ', userId)

		// const lutStationType = await this.lutStationTypeEntity
		// 	.createQueryBuilder('stationType')
		// 	.select(['stationType.id', 'stationType.name'])
		// 	.getMany()

		const region = await this.repoRegions
			.createQueryBuilder('region')
			.select(['region.regionId', 'region.regionName', 'region.regionNameEn'])
			.getMany()

		const position = await this.repoPosition
			.createQueryBuilder('position')
			.select(['position.positionId', 'position.positionName', 'position.positionNameEn'])
			.getMany()

		const province = await this.repoProvinces
			.createQueryBuilder('province')
			.select(['province.adm1Code', 'province.provinceName', 'province.provinceNameEn'])
			.getMany()

		const role = await this.repoRoles.createQueryBuilder('role').select(['role.roleId', 'role.roleName']).getMany()

		// const lookup = {
		// 	position,
		// 	region,
		// 	roles,
		// }

		// private readonly repoRegions: Repository<RegionsEntity>,

		// @InjectRepository(PositionEntity)
		// private readonly repoPosition: Repository<PositionEntity>,
		//
		console.log('province ', province)
		console.log('position ', position)
		console.log('role ', role)

		console.log('file ', file)
		console.log('user ', user)

		try {
			const wb = XLSX.read(file.buffer, { type: 'buffer' })
			const sheetName: string = wb.SheetNames[0]
			const worksheet: XLSX.WorkSheet = wb.Sheets[sheetName]
			const jsonData = XLSX.utils.sheet_to_json(worksheet)

			const arrayOfObject = []

			jsonData.forEach((item) => {
				const object = {}
				// const coordinate = []
				importUserTemplate.forEach((config) => {
					if (item[config.title] !== null || item[config.title] !== undefined || item[config.title] !== '') {
						if (config.validator.includes(ImportValidatorType.Lookup)) {
							if (config.fieldName === 'position') {
								const objPosition = position.find(
									(p) =>
										p.positionName.trim() === item?.[config.title]?.trim() ||
										p.positionNameEn.trim() === item?.[config.title]?.trim(),
								)

								object[config.fieldName] = objPosition
								console.log(' objPosition ', objPosition)
							}

							if (config.fieldName === 'region') {
								const objRegion = region.find(
									(r) =>
										r.regionName.trim() === item?.[config.title]?.trim() ||
										r.regionNameEn.trim() === item?.[config.title]?.trim(),
								)

								object[config.fieldName] = objRegion
							}

							if (config.fieldName === 'regions') {
								const splitRegion = item?.[config.title]?.toString()?.split(',')

								const res = region?.filter((r) => {
									return !!splitRegion?.find((sReg) => sReg.toString().trim() === r.regionName.trim())
								})

								object[config.fieldName] = res
							}

							if (config.fieldName === 'role') {
								const objRole = role.find((r) => r?.roleName?.trim() === item?.[config.title]?.trim())

								object[config.fieldName] = objRole
							}

							if (config.fieldName === 'province') {
								const objProvince = province.find(
									(r) =>
										r?.provinceName?.trim() === item?.[config.title]?.trim() ||
										r?.provinceNameEn?.trim() === item?.[config.title]?.trim(),
								)

								object[config.fieldName] = objProvince
							}
						} else {
							object[config.fieldName] = item[config.title]
						}
					}
				})

				// object['createdBy'] = { userId: Number(userId) }
				arrayOfObject.push(object)
			})

			console.log(' arrayOfObject ', arrayOfObject, new Date())

			// start transcation
			await this.entityManager.transaction(async (transactionalEntityManager) => {
				const list = transactionalEntityManager.create(UsersEntity, arrayOfObject)

				// import station
				await transactionalEntityManager.save(list)
			})

			return new ResponseDto()
		} catch (error) {
			console.error(error)
		}

		return new ResponseDto()
	}

	@Post('/import/template')
	@UseGuards(AuthGuard)
	async getImportTemplate() {
		return new ResponseDto({ data: {} })
	}
}
