import { ResponseDto } from '@interface/config/app.config'
import { GetProfileDtoOut, PostProfileDtoIn, PostProfileDtoOut } from '@interface/dto/profile/profile.dto-out'
import { Controller, Get, UseGuards, Request, Put } from '@nestjs/common'
import { AuthGuard } from 'src/core/auth.guard'
import { mockProfile } from './mock-profile'

@Controller('profile')
export class ProfileController {
	@Get('/:id')
	@UseGuards(AuthGuard)
	async get(@Request() req): Promise<ResponseDto<GetProfileDtoOut>> {
		const id = req.params.id

		return new ResponseDto({ data: mockProfile })
	}

	@Put('/:id')
	@UseGuards(AuthGuard)
	async put(@Request() req): Promise<ResponseDto<PostProfileDtoOut>> {
		const id = req.params.id
		const putData: PostProfileDtoIn = req.body
		return new ResponseDto({ data: { success: true } })
	}
}
