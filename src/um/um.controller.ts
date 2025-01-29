import { ResponseDto } from '@interface/config/app.config'
import { GetProfileDtoOut } from '@interface/dto/profile/profile.dto-out'
import { StatustoOut } from '@interface/config/app.config'
import { Controller, Delete, Get, Patch, Post, Put, Request, UseGuards, BadRequestException } from '@nestjs/common'
import { AuthGuard } from 'src/core/auth.guard'
import { mockUM } from './mock-um'
import { InjectRepository } from '@nestjs/typeorm'
import { UsersEntity } from '@interface/entities'
import { Repository } from 'typeorm'
import { errorResponse } from '@interface/config/error.config'

@Controller('um')
export class UMController {
	constructor(
		@InjectRepository(UsersEntity)
		private readonly userEntity: Repository<UsersEntity>,
	) {}

	@Get('/search')
	@UseGuards(AuthGuard)
	async search(): Promise<ResponseDto<GetProfileDtoOut[]>> {
		// return new ResponseDto({ data: [] })
		return new ResponseDto({ data: mockUM.data, total: mockUM.total })
	}

	@Get('/:userId')
	@UseGuards(AuthGuard)
	async get(@Request() req): Promise<ResponseDto<GetProfileDtoOut>> {
		const id = req.params.userId
		const result = await this.userEntity
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
			.where({ userId: id })
			.getMany()
		if (result.length === 0) throw new BadRequestException(errorResponse.USER_NOT_FOUND)
		return new ResponseDto({ data: result[0] as any })
	}

	@Post()
	@UseGuards(AuthGuard)
	async post(): Promise<ResponseDto<StatustoOut>> {
		return new ResponseDto({ data: { success: true } })
	}

	@Put('/:userId')
	@UseGuards(AuthGuard)
	async put(): Promise<ResponseDto<StatustoOut>> {
		return new ResponseDto({ data: { success: true } })
	}

	@Patch('/:userId')
	@UseGuards(AuthGuard)
	async patch(): Promise<ResponseDto<StatustoOut>> {
		return new ResponseDto({ data: { success: true } })
	}

	@Delete('/:userId')
	@UseGuards(AuthGuard)
	async delete(): Promise<ResponseDto<StatustoOut>> {
		return new ResponseDto({ data: { success: true } })
	}

	@Post('/import/xlsx')
	@UseGuards(AuthGuard)
	async postImportXlsx(): Promise<ResponseDto<StatustoOut>> {
		return new ResponseDto({ data: { success: true } })
	}

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
