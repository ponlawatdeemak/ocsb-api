import { Controller, Get, Res, Query, UseGuards } from '@nestjs/common'
import { ExportService } from './export.service'
import { ExportHotspotBurntAreaDtoIn, ExportYieldAreaDtoIn } from '@interface/dto/export/export.dto-in'
import { validatePayload } from 'src/core/utils'
import { mapTypeCode, yieldMapTypeCode } from '@interface/config/app.config'
import { reportName } from '@interface/config/report.config'
import { AuthGuard } from 'src/core/auth.guard'

@Controller('export')
export class ExportController {
	constructor(private readonly exportService: ExportService) {}

	@Get('hotspot-burnt-area')
	@UseGuards(AuthGuard)
	async getHotspotBurntArea(@Query() payload: ExportHotspotBurntAreaDtoIn, @Res() res) {
		const arrayResponse = []
		const mapTypeFilter = payload.mapType ? validatePayload(payload.mapType) : []

		if (mapTypeFilter.includes(mapTypeCode.hotspots)) {
			const hotspotData = await this.exportService.bufferHotspotService(payload)
			arrayResponse.push({ fileName: reportName.hotspont, data: hotspotData })
		}

		if (mapTypeFilter.includes(mapTypeCode.burnArea)) {
			const burnAreaData = await this.exportService.bufferBurnAreaService(payload)
			arrayResponse.push({ fileName: reportName.burntArea, data: burnAreaData })
		}

		if (mapTypeFilter.includes(mapTypeCode.plant)) {
			const yieldPredData = await this.exportService.bufferYieldAreaService(payload)
			arrayResponse.push({ fileName: reportName.plant, data: yieldPredData })
		}
		if (arrayResponse.length > 0) {
			const zipStream: any = await this.exportService.generateZip(arrayResponse)
			const formattedDate = new Date().toISOString().split('T')[0].replace(/-/g, '_')
			const zipname = `attachment; filename="hotspot_analyst_${formattedDate}.zip"`
			res.set({
				'Content-Type': 'application/zip',
				'Content-Disposition': zipname,
			})
			return zipStream.pipe(res)
		} else {
			return res.send({})
		}
	}

	@Get('yield-area')
	@UseGuards(AuthGuard)
	async getYieldArea(@Query() payload: ExportYieldAreaDtoIn, @Res() res) {
		const arrayResponse = []
		const mapTypeFilter = payload.mapType ? validatePayload(payload.mapType) : []

		if (mapTypeFilter.includes(yieldMapTypeCode.plant) || mapTypeFilter.includes(yieldMapTypeCode.product)) {
			const yieldPredData = await this.exportService.bufferYieldAreaService(payload)
			arrayResponse.push({ fileName: reportName.plant, data: yieldPredData })
		}

		if (mapTypeFilter.includes(yieldMapTypeCode.repeat)) {
			const RepearAreaData = await this.exportService.bufferRepeatAreaService(payload)
			arrayResponse.push({ fileName: reportName.plantRepeat, data: RepearAreaData })
		}
		if (arrayResponse.length > 0) {
			const zipStream: any = await this.exportService.generateZip(arrayResponse)
			const formattedDate = new Date().toISOString().split('T')[0].replace(/-/g, '_')
			const zipname = `attachment; filename="plant_analyst_${formattedDate}.zip"`
			res.set({
				'Content-Type': 'application/zip',
				'Content-Disposition': zipname,
			})
			return zipStream.pipe(res)
		} else {
			return res.send({})
		}
	}
}
