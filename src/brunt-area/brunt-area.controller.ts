import { hotspotTypeCode, ResponseDto } from '@interface/config/app.config'
import {
	GetBruntBruntAreaDtoIn,
	getDashBoardBruntAreaDtoIn,
	GetHotspotBruntAreaDtoIn,
	getHotspotCalendarDtoIn,
	GetIdentifyBruntAreaDtoIn,
	GetPlantBruntAreaDtoIn,
} from '@interface/dto/brunt-area/brunt-area.dto-in'
import {
	GetBruntBruntAreaDtoOut,
	getDashBoardBruntAreaDtoOut,
	GetHotspotBruntAreaDtoOut,
	getHotspotCalendarDtoOut,
	GetIdentifyBruntAreaDtoOut,
	GetPlantBruntAreaDtoOut,
} from '@interface/dto/brunt-area/brunt-area.dto.out'
import { SugarcaneDsBurnAreaEntity, SugarcaneDsYieldPredEntity, SugarcaneHotspotEntity } from '@interface/entities'
import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common'
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm'
import { AuthGuard } from 'src/core/auth.guard'
import { Repository, DataSource, Brackets } from 'typeorm'

@Controller('brunt-area')
export class BruntAreaController {
	constructor(
		@InjectDataSource()
		private readonly dataSource: DataSource,

		@InjectRepository(SugarcaneHotspotEntity)
		private readonly sugarcaneHotspotEntity: Repository<SugarcaneHotspotEntity>,

		@InjectRepository(SugarcaneDsBurnAreaEntity)
		private readonly sugarcaneDsBurnAreaEntity: Repository<SugarcaneDsBurnAreaEntity>,

		@InjectRepository(SugarcaneDsYieldPredEntity)
		private readonly sugarcaneDsYieldPredEntity: Repository<SugarcaneDsYieldPredEntity>,
	) {}

	@Get('hotspot')
	@UseGuards(AuthGuard)
	async getHotspot(
		@Query() payload: GetHotspotBruntAreaDtoIn,
		@Res() res,
	): Promise<ResponseDto<GetHotspotBruntAreaDtoOut[]>> {
		const inSugarcaneFilter = Array.isArray(payload?.inSugarcan)
			? payload?.inSugarcan
			: payload?.inSugarcan
				? [payload?.inSugarcan]
				: []

		const hotspots = await this.sugarcaneHotspotEntity
			.createQueryBuilder('sh')
			.select(
				`
                jsonb_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(sh.geometry)::jsonb,
                'properties', jsonb_build_object(
                    'regionId', sh.region_id,
                    'acqDate', sh.acq_date
                ) 
                ) as geojson
                `,
			)
			.where('sh.region_id IS NOT NULL')
			.andWhere(
				new Brackets((qb) => {
					if (
						inSugarcaneFilter.includes(hotspotTypeCode.inSugarcan) &&
						inSugarcaneFilter.includes(hotspotTypeCode.notInSugarcane)
					) {
						qb.where('1 = 1')
					} else if (inSugarcaneFilter.includes(hotspotTypeCode.inSugarcan)) {
						qb.where('sh.in_sugarcane = true')
					} else if (inSugarcaneFilter.includes(hotspotTypeCode.inSugarcan)) {
						qb.where('sh.in_sugarcane = false')
					}
				}),
			)
			.andWhere('DATE(sh.acq_date) BETWEEN :startDate AND :endDate', {
				startDate: '2024-10-01',
				endDate: '2025-05-31',
			})
			.getRawMany()
			.then((data) => {
				return data.map((item) => item.geojson)
			})
		res.setHeader('Cache-Control', 'public, max-age=3600')
		return res.json({
			data: hotspots,
		})
	}

	@Get('brunt')
	async getBurnt(@Query() payload: GetBruntBruntAreaDtoIn): Promise<ResponseDto<GetBruntBruntAreaDtoOut[]>> {
		const response = await this.sugarcaneDsBurnAreaEntity
			.createQueryBuilder('sb')
			.select('sb.geometry')
			.where('sb.region_id IS NOT NULL')
			.getMany()
		return new ResponseDto<GetBruntBruntAreaDtoOut[]>({ data: [] })
	}

	@Get('plant')
	async getPlant(@Query() payload: GetPlantBruntAreaDtoIn): Promise<ResponseDto<GetPlantBruntAreaDtoOut[]>> {
		const response = await this.sugarcaneDsYieldPredEntity
			.createQueryBuilder('sy')
			.select('sy.geometry')
			.where('sy.region_id IS NOT NULL')
			.getMany()
		return new ResponseDto<GetPlantBruntAreaDtoOut[]>({ data: [] })
	}

	@Get('dashboard')
	async getDashBoard(
		@Query() payload: getDashBoardBruntAreaDtoIn,
	): Promise<ResponseDto<getDashBoardBruntAreaDtoOut>> {
		return new ResponseDto<getDashBoardBruntAreaDtoOut>({ data: {} })
	}

	@Get('identify')
	async getIdentify(@Query() payload: GetIdentifyBruntAreaDtoIn): Promise<ResponseDto<GetIdentifyBruntAreaDtoOut>> {
		return new ResponseDto<GetIdentifyBruntAreaDtoOut>({ data: null })
	}

	@Get('hotspot-calendar')
	async getHotspotCalendar(
		@Query() payload: getHotspotCalendarDtoIn,
	): Promise<ResponseDto<getHotspotCalendarDtoOut>> {
		return new ResponseDto<getHotspotCalendarDtoOut>({ data: null })
	}
}
