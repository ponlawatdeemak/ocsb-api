import { Controller, Get, Res, Query, UseGuards, Req } from '@nestjs/common'
import { ExportService } from './export.service'
import {
	ExportHotspotBurntAreaDtoIn,
	ExportHotspotRegionDtoIn,
	ExportYieldAreaDtoIn,
} from '@interface/dto/export/export.dto-in'
import { validatePayload } from 'src/core/utils'
import { mapTypeCode, yieldMapTypeCode } from '@interface/config/app.config'
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
			arrayResponse.push(hotspotData)
		}

		if (mapTypeFilter.includes(mapTypeCode.burnArea)) {
			const burnAreaData = await this.exportService.bufferBurnAreaService(payload)
			arrayResponse.push(burnAreaData)
		}

		if (mapTypeFilter.includes(mapTypeCode.plant)) {
			const yieldPredData = await this.exportService.bufferYieldAreaService(payload)
			arrayResponse.push(yieldPredData)
		}
		if (arrayResponse.length > 0) {
			const zipStream = this.exportService.generateZip(arrayResponse)
			const formattedDate = new Date().toISOString().split('T')[0].replace(/-/g, '_')
			const zipname = `attachment; filename="hotspot_analyst_${formattedDate}.zip"`
			res.set({
				'Content-Type': 'application/zip',
				'Content-Disposition': zipname,
			})
			zipStream.pipe(res)
		} else {
			return res.send({})
		}
	}

	@Get('hotspot-region/:regionId/:round')
	@UseGuards(AuthGuard)
	async getHotspotRegion(@Req() req, @Res() res) {
		const payload: ExportHotspotRegionDtoIn = req.params

		const fileStream = await this.exportService.bufferHotspotRegion(payload)
		const formattedDate = new Date().toISOString().split('T')[0].replace(/-/g, '')
		res.setHeader('Content-Type', 'text/csv')
		res.setHeader(
			'Content-Disposition',
			`attachment; filename="hotspot_region${payload.regionId}_round${payload.round}_${formattedDate}.csv"`,
		)
		fileStream.stream.pipe(res)
	}

	@Get('yield-area')
	@UseGuards(AuthGuard)
	async getYieldArea(@Query() payload: ExportYieldAreaDtoIn, @Res() res) {
		const arrayResponse = []
		const mapTypeFilter = payload.mapType ? validatePayload(payload.mapType) : []

		if (mapTypeFilter.includes(yieldMapTypeCode.plant) || mapTypeFilter.includes(yieldMapTypeCode.product)) {
			const yieldPredData = await this.exportService.bufferYieldAreaService(payload)
			arrayResponse.push(yieldPredData)
		}

		if (mapTypeFilter.includes(yieldMapTypeCode.repeat)) {
			const RepearAreaData = await this.exportService.bufferRepeatAreaService(payload)
			arrayResponse.push(RepearAreaData)
		}
		if (arrayResponse.length > 0) {
			const zipStream = this.exportService.generateZip(arrayResponse)

			const formattedDate = new Date().toISOString().split('T')[0].replace(/-/g, '_')
			const zipname = `attachment; filename="plant_analyst_${formattedDate}.zip"`

			res.setHeader('Content-Type', 'application/zip')
			res.setHeader('Content-Disposition', zipname)
			zipStream.pipe(res)
		} else {
			return res.send({})
		}
	}
}
