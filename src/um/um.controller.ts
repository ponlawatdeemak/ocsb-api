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
	Res,
	StreamableFile,
} from '@nestjs/common'
import { PositionEntity, ProvincesEntity, RegionsEntity, RolesEntity, UsersEntity } from '@interface/entities'
import { AuthGuard } from 'src/core/auth.guard'
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm'
import { Repository, EntityManager, In } from 'typeorm'
import { errorResponse } from '@interface/config/error.config'
import {
	DeleteImageUserDtoOut,
	DeleteUMDtoOut,
	GetUMDtoOut,
	PostActiveUMDtoIn,
	PostImageUserDtoOut,
	PostImportCsvUMDtoOut,
	PostUMDtoOut,
	PostValidateCsvUMDtoOut,
	PutUMDtoOut,
	SearchUMDtoOut,
} from '@interface/dto/um/um.dto-out'
import {
	DeleteImageUserDtoIn,
	DeleteUMDtoIn,
	GetImageUserDtoIn,
	GetUMDtoIn,
	PostImageUserDtoIn,
	PostUMDtoIn,
	PutUMDtoIn,
	SearchUMDtoIn,
} from '@interface/dto/um/um.dto.in'
import { User } from 'src/core/user.decorator'
import { UserMeta } from '@interface/auth.type'
import { hashPassword, validatePayload } from 'src/core/utils'
import { RandomService } from 'src/core/random.service'
import { FileInterceptor } from '@nestjs/platform-express'
import * as XLSX from 'xlsx'
import { importUserTemplate, ImportValidatorType } from '@interface/config/um.config'
import { MailService } from 'src/core/mail.service'
import * as path from 'path'
import * as fs from 'fs'

@Controller('um')
export class UMController {
	constructor(
		private readonly randomService: RandomService,
		private readonly mailService: MailService,

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
	async search(@Query() query: SearchUMDtoIn): Promise<ResponseDto<SearchUMDtoOut[]>> {
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
			queryBuilder.andWhere('region.regionId IN (:...regionIds)', { regionIds: validatePayload(query.region) })
		}
		if (query.role) {
			queryBuilder.andWhere('role.roleId IN (:...roleIds)', { roleIds: validatePayload(query.role) })
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
	async post(@Body() payload: PostUMDtoIn, @User() user: UserMeta): Promise<ResponseDto<PostUMDtoOut>> {
		let newUserId = null
		const cnt = await this.userEntity.countBy({ email: payload.email, isDeleted: false })
		if (cnt > 0) throw new BadRequestException(errorResponse.USER_EMAIL_DUPLICATED)
		await this.entityManager.transaction(async (transactionalEntityManager) => {
			const newPassword = this.randomService.generatePassword()
			const newUser = transactionalEntityManager.create(UsersEntity, payload)
			newUser.createdBy = { userId: user?.id }
			newUser.updatedBy = { userId: user?.id }
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
		const params: GetUMDtoIn = req.params
		const result: GetUMDtoOut[] = await this.userEntity
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
	async put(@Request() req, @User() user: UserMeta): Promise<ResponseDto<PutUMDtoOut>> {
		const userId = req.params.userId
		const payload: PutUMDtoIn = req.body
		const existingUser = await this.userEntity.findOne({
			where: { userId, isDeleted: false },
			relations: ['regions'],
		})
		if (!existingUser) throw new BadRequestException(errorResponse.USER_NOT_FOUND)
		await this.entityManager.transaction(async (transactionalEntityManager) => {
			Object.assign(existingUser, payload)
			existingUser.updatedBy = { userId: user?.id }
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
	async delete(@Request() req, @User() user: UserMeta): Promise<ResponseDto<DeleteUMDtoOut>> {
		const params: DeleteUMDtoIn = req.params
		const existingUser = await this.userEntity.findOne({ where: { userId: params.userId, isDeleted: false } })
		if (!existingUser) throw new BadRequestException(errorResponse.USER_NOT_FOUND)
		await this.entityManager.transaction(async (transactionalEntityManager) => {
			existingUser.isDeleted = true
			existingUser.updatedBy = { userId: user?.id }
			existingUser.updatedAt = new Date()

			// บันทึกข้อมูลใหม่
			await transactionalEntityManager.save(existingUser)
		})

		return new ResponseDto({ data: { id: params.userId } })
	}

	@Post('/validate/csv')
	@UseGuards(AuthGuard)
	@UseInterceptors(FileInterceptor('file'))
	async uploadFile(@UploadedFile() file: Express.Multer.File): Promise<ResponseDto<PostValidateCsvUMDtoOut>> {
		const wb = XLSX.read(file.buffer, { type: 'buffer' })

		const sheetName: string = wb.SheetNames[0]
		const worksheet: XLSX.WorkSheet = wb.Sheets[sheetName]

		let totalImportableRow = 0
		let totalNonImportableRow = 0

		const jsonData = XLSX.utils.sheet_to_json(worksheet)
		const totalRow = jsonData.length

		const errorList: { rowNo: number; remarkList: string[] }[] = []

		const validateRow = async (row: any, index: number) => {
			const remarkList = []
			let hasError = false

			for (let index = 0; index < importUserTemplate.length; index++) {
				const element = importUserTemplate[index]
				const value = row[element.title]
				if (element.condition?.required && !value) {
					remarkList.push(`กรุณาระบุ${element?.title}`)
					hasError = true
				}
				if (element.condition?.userDuplicate && value) {
					const user = await this.userEntity.findOne({
						where: [{ [element.condition?.userDuplicate]: value }],
					})
					if (user) {
						remarkList.push(`ข้อมูล${element?.title}ซ้ำ`)
						hasError = true
					}
				}
				if (element.condition?.lookup && value) {
					const splitValue = value
						.toString()
						.split(',')
						.map((item) => item.trim())
					let result = null
					if (element.fieldName === 'role') {
						result = await this.entityManager
							.createQueryBuilder(element.condition?.lookup, element.condition?.lookup)
							.where({ [element.condition?.lookupField]: In(splitValue) })
							.getMany()
					} else {
						result = await this.entityManager
							.createQueryBuilder(element.condition?.lookup, element.condition?.lookup)
							.where({ [element.condition?.lookupField]: In(splitValue) })
							.orWhere({ [`${element.condition?.lookupField}En`]: In(splitValue) })
							.getMany()
					}
					if (result.length === 0) {
						remarkList.push(`ไม่พบประเภท${element?.title}`)
						hasError = true
					}
				}

				if (element.condition?.maxLength && value) {
					if (value.toString().length > element.condition?.maxLength) {
						remarkList.push(`${element?.title}ความยาวตัวอักษรเกินกำหนด`)
						hasError = true
					}
				}
			}
			if (hasError) {
				return { hasError: hasError, errorItem: { rowNo: index + 1, remarkList } }
			} else {
				return { hasError: hasError }
			}
		}

		for (let jsonIndex = 0; jsonIndex < jsonData.length; jsonIndex++) {
			const row = jsonData[jsonIndex]
			const validationResult = await validateRow(row, jsonIndex)

			if (validationResult.hasError) {
				totalNonImportableRow++
				errorList.push(validationResult.errorItem)
			} else {
				totalImportableRow++
			}
		}

		return new ResponseDto({
			data: {
				fileName: file.originalname,
				totalRow: totalRow,
				totalImportableRow: totalImportableRow,
				totalNonImportableRow: totalNonImportableRow,
				errorList: errorList, // Optional: list of all validation errors found
			},
		})
	}

	@Post('/import/csv')
	@UseGuards(AuthGuard)
	@UseInterceptors(FileInterceptor('file'))
	async postImportCsv(
		@User() user: UserMeta,
		@UploadedFile() file: Express.Multer.File,
	): Promise<ResponseDto<PostImportCsvUMDtoOut>> {
		const userId = user.id

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

		try {
			const wb = XLSX.read(file.buffer, { type: 'buffer' })
			const sheetName: string = wb.SheetNames[0]
			const worksheet: XLSX.WorkSheet = wb.Sheets[sheetName]
			const jsonData = XLSX.utils.sheet_to_json(worksheet)

			const arrayOfObject = []
			// Loop Data ที่ได้จาก Excel
			jsonData.forEach((item) => {
				const object = {}
				importUserTemplate.forEach((config) => {
					// Check ก่อนว่ามี key ไหม
					if (item[config.title] !== null || item[config.title] !== undefined || item[config.title] !== '') {
						// Check validator คือ Lookup
						if (config.validator.includes(ImportValidatorType.Lookup)) {
							// เอา Data จาก Excel ไปหาข้อมูลตาม look up
							if (config.fieldName === 'position') {
								//ตำแหน่ง
								const objPosition = position.find(
									(p) =>
										p.positionName.trim() === item?.[config.title]?.trim() ||
										p.positionNameEn.trim() === item?.[config.title]?.trim(),
								)

								object[config.fieldName] = objPosition
							}

							if (config.fieldName === 'region') {
								//ภาค
								const objRegion = region.find(
									(r) =>
										r.regionName.trim() === item?.[config.title]?.trim() ||
										r.regionNameEn.trim() === item?.[config.title]?.trim(),
								)

								object[config.fieldName] = objRegion
							}

							if (config.fieldName === 'regions') {
								//ภูมิภาคที่ดูแล
								const splitRegion = item?.[config.title]?.toString()?.split(',')

								const res = region?.filter((r) => {
									return !!splitRegion?.find((sReg) => sReg.toString().trim() === r.regionName.trim())
								})

								object[config.fieldName] = res
							}

							if (config.fieldName === 'role') {
								//สิทธ์การเข้าถึง
								const objRole = role.find((r) => r?.roleName?.trim() === item?.[config.title]?.trim())

								object[config.fieldName] = objRole
							}

							if (config.fieldName === 'province') {
								//จังหวัด
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
				object['createdBy'] = { userId: Number(userId) }
				arrayOfObject.push(object)
			})

			// start transcation
			await this.entityManager.transaction(async (transactionalEntityManager) => {
				const list = transactionalEntityManager.create(UsersEntity, arrayOfObject)

				// import station
				await transactionalEntityManager.save(list)
			})

			return new ResponseDto({ data: { success: true } })
		} catch (error) {
			console.error(error)
			return new ResponseDto()
		}
	}

	@Get('/img/:userId')
	// @UseGuards(AuthGuard)
	async getImage(@Request() req, @Res() res) {
		const params: GetImageUserDtoIn = req.params
		const existingUser = await this.userEntity.findOne({ where: { userId: params.userId, isDeleted: false } })
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
		const existingUser = await this.userEntity.findOne({ where: { userId: params.userId, isDeleted: false } })
		if (!existingUser) throw new BadRequestException(errorResponse.USER_NOT_FOUND)
		await this.entityManager.transaction(async (transactionalEntityManager) => {
			existingUser.img = base64Image
			existingUser.updatedBy = { userId: user.id }
			existingUser.updatedAt = new Date()
			await transactionalEntityManager.save(existingUser)
		})
		return new ResponseDto({ data: { id: params.userId } })
	}

	@Delete('/img/:userId')
	@UseGuards(AuthGuard)
	async deleteImage(@Request() req, @User() user: UserMeta): Promise<ResponseDto<DeleteImageUserDtoOut>> {
		const params: DeleteImageUserDtoIn = req.params
		const existingUser = await this.userEntity.findOne({ where: { userId: params.userId, isDeleted: false } })
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

		return new ResponseDto({ data: { id: user.id } })
	}

	@Post('/active')
	@UseGuards(AuthGuard)
	async active(@Body() payload: PostActiveUMDtoIn, @User() user: UserMeta): Promise<ResponseDto<null>> {
		// Search App user
		const existingUser = await this.userEntity.find({ where: { userId: In(payload.userIds.split(',')) } })

		if (!existingUser) throw new BadRequestException(errorResponse.USER_NOT_FOUND)

		// edit active
		existingUser.forEach((item) => {
			item.isActive = payload.isActive
			item.updatedAt = new Date()
			item.updatedBy = { userId: user.id }
		})

		await this.entityManager.transaction(async (transactionalEntityManager) => {
			// save
			await transactionalEntityManager.save(existingUser)
		})

		return new ResponseDto({ data: null })
	}
}
