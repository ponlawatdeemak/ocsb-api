import { ResponseDto, yieldMapTypeCode } from '@interface/config/app.config'
import { errorResponse } from '@interface/config/error.config'
import { GetDashboardYieldAreaDtoIn } from '@interface/dto/yield-area/yield-area.dto-in'
import { GetDashboardYieldAreaDtoOut } from '@interface/dto/yield-area/yield-area.dto-out'
import { Controller, Get, Query, BadRequestException, UseGuards } from '@nestjs/common'
import { AuthGuard } from 'src/core/auth.guard'
import { validateDate, validatePayload } from 'src/core/utils'
import { YieldService } from './yield-area.service'

@Controller('yield-area')
export class YieldAreaController {
	constructor(private readonly yieldService: YieldService) {}

	@Get('dashboard')
	@UseGuards(AuthGuard)
	async getDashboard(
		@Query() payload: GetDashboardYieldAreaDtoIn,
	): Promise<ResponseDto<GetDashboardYieldAreaDtoOut>> {
		let objResponse = {}
		const mapTypeFilter = payload.mapType ? validatePayload(payload.mapType) : []
		if (validateDate(payload.startDate, payload.endDate)) throw new BadRequestException(errorResponse.INVALID_DATE)

		if (mapTypeFilter.includes(yieldMapTypeCode.plant)) {
			const plantData = await this.yieldService.getPlant(payload)
			objResponse = {
				...objResponse,
				plant: plantData,
			}
		}

		if (mapTypeFilter.includes(yieldMapTypeCode.product)) {
			const productData = await this.yieldService.getProduct(payload)
			objResponse = {
				...objResponse,
				product: productData,
			}
		}

		return new ResponseDto<GetDashboardYieldAreaDtoOut>({ data: objResponse })
	}
}
