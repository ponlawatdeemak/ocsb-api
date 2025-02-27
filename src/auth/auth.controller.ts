import { UserJwtPayload } from '@interface/auth.type'
import { ResponseDto } from '@interface/config/app.config'
import { errorResponse } from '@interface/config/error.config'
import {
	ForgotPasswordAuthDtoIn,
	LoginAuthDtoIn,
	RefreshTokenAuthDtoIn,
	ResetPasswordAuthDtoIn,
	VerifyTokenAuthDtoIn,
} from '@interface/dto/auth/auth.dto-in'
import {
	ForgotPasswordAuthDtoOut,
	LoginAuthDtoOut,
	RefreshTokenAuthDtoOut,
	ResetPasswordAuthDtoOut,
	VerifyTokenAuthDtoOut,
} from '@interface/dto/auth/auth.dto-out'
import { BoundaryRegionEntity, UsersEntity } from '@interface/entities'
import { Body, Controller, Post, UnauthorizedException, BadRequestException, Put } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm'
import * as bcrypt from 'bcryptjs'
import * as jwt from 'jsonwebtoken'
import { generateTokenHex, hashPassword, hash } from 'src/core/utils'
import { EntityManager, Repository } from 'typeorm'
import { MailService } from 'src/core/mail.service'
@Controller('auth')
export class AuthController {
	private readonly accessTokenExpried = '1h'
	private readonly refreshTokenExpried = '1.5h'

	constructor(
		private readonly mailService: MailService,
		private readonly config: ConfigService,

		@InjectEntityManager()
		private readonly entityManager: EntityManager,

		@InjectRepository(UsersEntity)
		private readonly userEntity: Repository<UsersEntity>,

		@InjectRepository(BoundaryRegionEntity)
		private readonly boundaryRegionEntity: Repository<BoundaryRegionEntity>,
	) {}

	@Post('/hash-password')
	async hashPassword(@Body() body) {
		const hashedPassword = await hashPassword(body.password)
		return new ResponseDto({ data: hashedPassword })
	}

	@Post('/login')
	async login(@Body() body: LoginAuthDtoIn): Promise<ResponseDto<LoginAuthDtoOut>> {
		const { email, password } = body
		const user = await this.userEntity
			.createQueryBuilder('users')
			.select([
				'users.userId',
				'users.firstName',
				'users.lastName',
				'users.email',
				'users.phone',
				'users.isActive',
				'users.password',
				'users.img',
			])
			.leftJoinAndSelect('users.role', 'role')
			.leftJoinAndSelect('users.position', 'position')
			.leftJoinAndSelect('users.region', 'region')
			.leftJoinAndSelect('users.regions', 'regions')
			.where({ email: email, isDeleted: false, isActive: true })
			.getOne()
		if (!user) {
			throw new UnauthorizedException(errorResponse.INCORRECT_CREDENTIALS)
		}

		const regionIds = user.regions.map((region) => region.regionId) // ดึง regionId ทั้งหมด

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
		const isPasswordValid = await bcrypt.compare(password, user.password)
		if (!isPasswordValid) {
			throw new UnauthorizedException(errorResponse.INCORRECT_CREDENTIALS)
		}
		const paylod = {
			sub: user.userId,
			id: user.userId,
			email: user.email,
		}
		const accessToken = jwt.sign(paylod, process.env.JWT_SECRET, { expiresIn: this.accessTokenExpried })
		const refreshToken = jwt.sign(paylod, process.env.JWT_SECRET_REFRESH, {
			expiresIn: this.refreshTokenExpried,
		})
		const bboxArray = getPosition.extend
			.replace('BOX(', '')
			.replace(')', '')
			.split(',')
			.map((coord) => coord.trim().split(' ').map(parseFloat))
		const hasImage = !!user.img
		delete user.img
		const userOut = {
			...user,
			password: undefined,
			userId: undefined,
			geometry: bboxArray,
		}
		const data: LoginAuthDtoOut = { id: user.userId, accessToken, refreshToken, ...userOut, hasImage }
		return new ResponseDto({ data })
	}

	@Post('/refresh-token')
	async refreshToken(@Body() body: RefreshTokenAuthDtoIn): Promise<ResponseDto<RefreshTokenAuthDtoOut>> {
		try {
			const data = jwt.verify(body.refreshToken, process.env.JWT_SECRET_REFRESH) as UserJwtPayload
			if (!data && !data.id) throw new UnauthorizedException(errorResponse.INVALID_TOKEN)
			const user = await this.userEntity.findOne({ where: { userId: data.id } })
			if (!user) {
				throw new UnauthorizedException(errorResponse.USER_NOT_FOUND)
			}
			const paylod = {
				sub: user.userId,
				id: user.userId,
				email: user.email,
			}

			const accessToken = jwt.sign(paylod, process.env.JWT_SECRET, { expiresIn: this.accessTokenExpried })
			const refreshToken = jwt.sign(paylod, process.env.JWT_SECRET_REFRESH, {
				expiresIn: this.refreshTokenExpried,
			})

			return new ResponseDto({ data: { accessToken, refreshToken } })
		} catch (error) {
			if (error.name === 'JsonWebTokenError') throw new UnauthorizedException(errorResponse.INVALID_TOKEN)
			if (error.name === 'TokenExpiredError') throw new UnauthorizedException(errorResponse.EXPIRED_TOKEN)
			throw error
		}
	}

	@Post('/forget-password')
	async forgotPassword(@Body() payload: ForgotPasswordAuthDtoIn): Promise<ResponseDto<ForgotPasswordAuthDtoOut>> {
		const email = payload.email
		if (!email) throw new BadRequestException(errorResponse.INVALID_EMAIL)
		const user = await this.userEntity.findOne({ where: { email, isDeleted: false, isActive: true } })
		if (!user) throw new BadRequestException(errorResponse.USER_NOT_FOUND)

		const RESET_PASSWORD_TIMEOUT = this.config.get<number>('RESET_PASSWORD_TIMEOUT')
		const RESET_PASSWORD_FRONTEND_URL = this.config.get<number>('RESET_PASSWORD_FRONTEND_URL')

		const resetToken = generateTokenHex(16)
		const resetLink = `${RESET_PASSWORD_FRONTEND_URL}?token=${resetToken}`

		const now = new Date()

		user.resetPasswordExpire = new Date(now.getTime() + 60 * 60 * 1000 * RESET_PASSWORD_TIMEOUT)
		user.resetPasswordToken = resetToken
		await this.userEntity.save(user)

		await this.mailService.sendResetPassword(user.email, user.firstName, resetLink, RESET_PASSWORD_TIMEOUT)

		return new ResponseDto({ data: { success: true } })
	}

	@Post('/verify-token')
	async verifyToken(@Body() payload: VerifyTokenAuthDtoIn): Promise<ResponseDto<VerifyTokenAuthDtoOut>> {
		const resetPasswordToken = payload.token
		if (!resetPasswordToken) throw new BadRequestException(errorResponse.INVALID_TOKEN)
		const user = await this.userEntity.findOneBy({ resetPasswordToken, isDeleted: false, isActive: true })
		if (!user) throw new BadRequestException(errorResponse.INVALID_TOKEN)

		const now = new Date()

		if (now > user.resetPasswordExpire) throw new BadRequestException(errorResponse.EXPIRED_TOKEN)

		return new ResponseDto({ data: { isValid: true } })
	}

	@Put('/reset-password')
	async resetPassword(@Body() payload: ResetPasswordAuthDtoIn): Promise<ResponseDto<ResetPasswordAuthDtoOut>> {
		const resetPasswordToken = payload.token

		await this.entityManager.transaction(async (transactionalEntityManager) => {
			if (!resetPasswordToken) throw new BadRequestException(errorResponse.INVALID_TOKEN)
			const user = await transactionalEntityManager.findOneBy(UsersEntity, {
				resetPasswordToken,
				isDeleted: false,
			})
			if (!user) throw new BadRequestException(errorResponse.INVALID_TOKEN)

			const now = new Date()
			if (now > user.resetPasswordExpire) throw new BadRequestException(errorResponse.EXPIRED_TOKEN)

			user.password = await hash(payload.newPassword)
			user.resetPasswordToken = null
			user.resetPasswordExpire = null
			user.updatedBy = { userId: user.userId }
			user.updatedAt = new Date()
			await transactionalEntityManager.save(user)
		})

		return new ResponseDto({ data: { success: true } })
	}
}
