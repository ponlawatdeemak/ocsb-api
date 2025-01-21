import { ResponseDto } from '@interface/config/app.config'
import { GetProfileDtoOut } from '@interface/dto/profile/profile.dto-out'
import { StatustoOut } from '@interface/config/app.config'
import { Controller, Delete, Get, Patch, Post, Put, Request, UseGuards } from '@nestjs/common'
import { AuthGuard } from 'src/core/auth.guard'
import { mockUM } from './mock-um'

@Controller('um')
export class UMController {
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
		const findid = mockUM.data.find((item) => item.id === id)
		return new ResponseDto({ data: findid })
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
