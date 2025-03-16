import { ResponseDto } from '@interface/config/app.config'
import {
	ChangePasswordProfileDtoOut,
	ConnectLineDtoOut,
	GetProfileDtoOut,
} from '@interface/dto/profile/profile.dto-out'
import { Controller, Get, UseGuards, Request, Put, Body, BadRequestException, Post, Res } from '@nestjs/common'
import { AuthGuard } from 'src/core/auth.guard'
import { UserMeta } from '@interface/auth.type'
import * as bcrypt from 'bcryptjs'
import { User } from 'src/core/user.decorator'
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm'
import { Repository, EntityManager } from 'typeorm'
import { BoundaryRegionEntity, UsersEntity } from '@interface/entities'
import { hashPassword } from 'src/core/utils'
import { errorResponse } from '@interface/config/error.config'
import { ChangePasswordProfileDtoIn, ConnectLineDtoIn } from '@interface/dto/profile/profile.dto-in'
@Controller('profile')
export class ProfileController {
	constructor(
		@InjectEntityManager()
		private readonly entityManager: EntityManager,

		@InjectRepository(UsersEntity)
		private readonly userEntity: Repository<UsersEntity>,

		@InjectRepository(BoundaryRegionEntity)
		private readonly boundaryRegionEntity: Repository<BoundaryRegionEntity>,
	) {}

	@Get('')
	@UseGuards(AuthGuard)
	async get(@Request() req, @User() user: UserMeta): Promise<ResponseDto<GetProfileDtoOut>> {
		const result = await this.userEntity
			.createQueryBuilder('users')
			.select([
				'users.userId',
				'users.firstName',
				'users.lastName',
				'users.email',
				'users.phone',
				'users.isActive',
				'users.img',
			])
			.leftJoinAndSelect('users.role', 'role')
			.leftJoinAndSelect('role.roleFeatures', 'role_features')
			.leftJoinAndSelect('role_features.feature', 'feature')
			.leftJoinAndSelect('users.regions', 'regions')
			.leftJoinAndSelect('users.position', 'position')
			.leftJoinAndSelect('users.region', 'region')
			.leftJoinAndSelect('users.province', 'province')
			.where({ userId: user.id })
			.getOne()
		if (!result) throw new BadRequestException(errorResponse.USER_NOT_FOUND)

		const regionIds = result.regions.map((region) => region.regionId) // ดึง regionId ทั้งหมด

		const getPosition = await this.boundaryRegionEntity
			.createQueryBuilder()
			.select('ST_Extent(merged.geometry)', 'extend')
			.from((subQuery) => {
				return subQuery
					.select('ST_Union(br.geometry)', 'geometry')
					.from('boundary_region', 'br')
					.where('br.region_id IN (:...ids)', { ids: regionIds })
			}, 'merged')
			.getRawOne()

		const bboxArray = getPosition.extend
			.replace('BOX(', '')
			.replace(')', '')
			.split(',')
			.map((coord) => coord.trim().split(' ').map(parseFloat))

		const hasImage = !!result.img
		delete result.img
		const profile = { ...result, geometry: bboxArray, hasImage }
		const temp: GetProfileDtoOut = profile
		return new ResponseDto({ data: temp })
	}

	@Put('/change-password')
	@UseGuards(AuthGuard)
	async changePassword(
		@User() user: UserMeta,
		@Body() putData: ChangePasswordProfileDtoIn,
	): Promise<ResponseDto<ChangePasswordProfileDtoOut>> {
		const id = user.id
		await this.entityManager.transaction(async (transactionalEntityManager) => {
			if (!id) throw new BadRequestException(errorResponse.USER_NOT_FOUND)
			const userRow = await transactionalEntityManager.findOneBy(UsersEntity, { userId: id })

			const IsValidOldPassword = await bcrypt.compare(putData.oldPassword, userRow.password)

			if (!IsValidOldPassword) throw new BadRequestException('Invalid old password')

			userRow.password = await hashPassword(putData.newPassword)
			userRow.updatedAt = new Date()
			userRow.updatedBy = { userId: id }
			await transactionalEntityManager.save(userRow)
		})

		return new ResponseDto({ data: { success: true } })
	}

	@Post('line-connect')
	async connectLine(
		@Body() payload: ConnectLineDtoIn,
		@User() user: UserMeta,
	): Promise<ResponseDto<ConnectLineDtoOut>> {
		const lineUser = await this.userEntity.findOne({ where: { lineUserId: payload.lineUserId } })
		if (lineUser) {
			throw new BadRequestException()
		} else {
			const row = await this.userEntity.findOne({ where: { userId: user.id } })
			row.lineUserId = payload.lineUserId
			await this.userEntity.save(row)

			return new ResponseDto({ data: { success: true } })
		}
	}

	@Post('line-disconnect')
	async disconnectLine(@User() user: UserMeta): Promise<ResponseDto<ConnectLineDtoOut>> {
		const row = await this.userEntity.findOne({ where: { userId: user.id } })
		row.lineUserId = null
		await this.userEntity.save(row)

		return new ResponseDto({ data: { success: true } })
	}

	@Get('/img/:size')
	async getImage(@Request() req, @Res() res) {
		const params = req.params

		res.setHeader('Content-Type', 'image/png')
		const imageBuffer = Buffer.from(existingUser.img, 'base64')
		res.setHeader('Cache-Control', 'public, max-age=3600')
		return res.send(imageBuffer)
	}
}
