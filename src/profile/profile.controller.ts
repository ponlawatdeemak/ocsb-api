import { ResponseDto } from '@interface/config/app.config'
import { ChangePasswordProfileDtoOut, GetProfileDtoOut } from '@interface/dto/profile/profile.dto-out'
import { Controller, Get, UseGuards, Request, Put, Body, BadRequestException } from '@nestjs/common'
import { AuthGuard } from 'src/core/auth.guard'
import { UserMeta } from '@interface/auth.type'
import * as bcrypt from 'bcryptjs'
import { User } from 'src/core/user.decorator'
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm'
import { Repository, EntityManager } from 'typeorm'
import { UsersEntity } from '@interface/entities'
import { hashPassword } from 'src/core/utils'
import { errorResponse } from '@interface/config/error.config'
import { ChangePasswordProfileDtoIn } from '@interface/dto/profile/profile.dto-in'
@Controller('profile')
export class ProfileController {
	constructor(
		@InjectEntityManager()
		private readonly entityManager: EntityManager,

		@InjectRepository(UsersEntity)
		private readonly userEntity: Repository<UsersEntity>,
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
			.leftJoinAndSelect('role_features.feature', 'feature') // Join Feature Table ผ่าน role_feature
			.leftJoinAndSelect('users.regions', 'regions')
			.leftJoinAndSelect('users.position', 'position')
			.leftJoinAndSelect('users.region', 'region')
			.leftJoinAndSelect('users.province', 'province')
			.where({ userId: user.id })
			.getMany()
		if (result.length === 0) throw new BadRequestException(errorResponse.USER_NOT_FOUND)
		const hasImage = !!result[0].img
		delete result[0].img
		const temp: GetProfileDtoOut = { ...result[0], hasImage }
		return new ResponseDto({ data: temp })
	}

	@Put('/change-password')
	@UseGuards(AuthGuard)
	async changePassword(
		@User() user: UserMeta,
		@Body() putData: ChangePasswordProfileDtoIn,
	): Promise<ResponseDto<ChangePasswordProfileDtoOut>> {
		const id = user.id
		// start transcation
		await this.entityManager.transaction(async (transactionalEntityManager) => {
			const userRow = await transactionalEntityManager.findOneBy(UsersEntity, { userId: id })

			const IsValidOldPassword = await bcrypt.compare(putData.oldPassword, userRow.password)

			if (!IsValidOldPassword) throw new BadRequestException('Invalid old password')

			userRow.password = await hashPassword(putData.newPassword)
			userRow.updatedAt = new Date()
			userRow.updatedBy = { userId: id }
			// update user
			await transactionalEntityManager.save(userRow)

			// insert log
			// const newLog = new LogUserEntity()
			// newLog.operatedDt = new Date()
			// newLog.operatedBy = { id }
			// newLog.type = { id: LutLogUserType.changePassword }
			// newLog.operatedAccount = userRow.email

			// await transactionalEntityManager.save(newLog)
		})

		return new ResponseDto({ data: { success: true } })
	}
}
