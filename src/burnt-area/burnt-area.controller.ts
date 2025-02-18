import { hotspotTypeCode, mapTypeCode, ResponseDto } from '@interface/config/app.config'
import {
	GetBurntBurntAreaDtoIn,
	GetDashBoardBurntAreaDtoIn,
	GetHotspotBurntAreaDtoIn,
	GetHotspotCalendarDtoIn,
	GetIdentifyBurntAreaDtoIn,
	GetPlantBurntAreaDtoIn,
} from '@interface/dto/brunt-area/brunt-area.dto-in'
import {
	GetBurntBurntAreaDtoOut,
	GetDashBoardBurntAreaDtoOut,
	GetHotspotBurntAreaDtoOut,
	GetHotspotCalendarDtoOut,
	GetIdentifyBurntAreaDtoOut,
	GetPlantBurntAreaDtoOut,
} from '@interface/dto/brunt-area/brunt-area.dto.out'
import { SugarcaneDsBurnAreaEntity, SugarcaneDsYieldPredEntity, SugarcaneHotspotEntity } from '@interface/entities'
import { Controller, Get, Query, UseGuards, Res, BadRequestException } from '@nestjs/common'
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm'
import { AuthGuard } from 'src/core/auth.guard'
import { validateDateRange, validatePayload } from 'src/core/utils'
import { Repository, DataSource, Brackets } from 'typeorm'
import { BurntAreaService } from './burnt-area.service'

@Controller('brunt-area')
export class BurntAreaController {
	constructor(
		@InjectDataSource()
		private readonly dataSource: DataSource,

		@InjectRepository(SugarcaneHotspotEntity)
		private readonly sugarcaneHotspotEntity: Repository<SugarcaneHotspotEntity>,

		@InjectRepository(SugarcaneDsBurnAreaEntity)
		private readonly sugarcaneDsBurnAreaEntity: Repository<SugarcaneDsBurnAreaEntity>,

		@InjectRepository(SugarcaneDsYieldPredEntity)
		private readonly sugarcaneDsYieldPredEntity: Repository<SugarcaneDsYieldPredEntity>,

		private readonly burntAreaService: BurntAreaService,
	) {}

	@Get('hotspot')
	@UseGuards(AuthGuard)
	async getHotspot(
		@Query() payload: GetHotspotBurntAreaDtoIn,
		@Res() res,
	): Promise<ResponseDto<GetHotspotBurntAreaDtoOut[]>> {
		const inSugarcaneFilter = payload?.inSugarcan ? validatePayload(payload?.inSugarcan) : []
		let hotspots: GetHotspotBurntAreaDtoOut[] = []
		if (inSugarcaneFilter.length !== 0) {
			const queryBuilderHotspot = await this.sugarcaneHotspotEntity
				.createQueryBuilder('sh')
				.select(
					`
                jsonb_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(sh.geometry)::jsonb,
                'properties', jsonb_build_object(
                    'id', sh.id,
                    'regionId', sh.region_id,
                    'date', sh.acq_date
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
			if (payload.startDate && payload.endDate) {
				queryBuilderHotspot.andWhere('DATE(sh.acq_date) BETWEEN :startDate AND :endDate', {
					startDate: payload.startDate,
					endDate: payload.endDate,
				})
			}
			hotspots = await queryBuilderHotspot.getRawMany().then((data) => {
				return data.map((item) => item.geojson)
			})
		}
		res.setHeader('Cache-Control', 'public, max-age=3600')
		return res.json({
			data: hotspots,
		})
	}

	@Get('burnt')
	@UseGuards(AuthGuard)
	async getBurnt(
		@Query() payload: GetBurntBurntAreaDtoIn,
		@Res() res,
	): Promise<ResponseDto<GetBurntBurntAreaDtoOut[]>> {
		const queryBuilderBurnArea = await this.sugarcaneDsBurnAreaEntity
			.createQueryBuilder('sdba')
			.select(
				`
                    jsonb_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(sdba.geometry)::jsonb,
                    'properties', jsonb_build_object(
                    'id', sdba.id,
                    'regionId', sdba.region_id,
                    'date', sdba.detected_d,
                    'subDistrict', jsonb_build_object(
                    'en', sdba.o_adm3e ,
                    'th', sdba.o_adm3t
                    ),
                    'district', jsonb_build_object(
                    'en', sdba.o_adm2e ,
                    'th', sdba.o_adm2t
                    ),
                    'province', jsonb_build_object(
                    'en', sdba.o_adm1e ,
                    'th', sdba.o_adm1t
                    ),
                    'area', jsonb_build_object(
                    'm2', sdba.area_m2 ,
                    'km2', sdba.area_km2, 
                    'rai', sdba.area_rai , 
                    'hexa', sdba.area_hexa
                    )
                    )
                ) AS geojson
                `,
			)
			.where('sdba.region_id IS NOT NULL')
		if (payload.startDate && payload.endDate) {
			queryBuilderBurnArea.andWhere('DATE(sdba.detected_d) BETWEEN :startDate AND :endDate', {
				startDate: payload.startDate,
				endDate: payload.endDate,
			})
		}

		const burnArea: GetBurntBurntAreaDtoOut[] = await queryBuilderBurnArea.getRawMany().then((data) => {
			return data.map((item) => item.geojson)
		})
		res.setHeader('Cache-Control', 'public, max-age=3600')
		return res.json({
			data: burnArea,
		})
	}

	@Get('plant')
	@UseGuards(AuthGuard)
	async getPlant(
		@Query() payload: GetPlantBurntAreaDtoIn,
		@Res() res,
	): Promise<ResponseDto<GetPlantBurntAreaDtoOut[]>> {
		const queryBuilderYieldPred = await this.sugarcaneDsYieldPredEntity
			.createQueryBuilder('sdyp')
			.select(
				`
                   jsonb_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(sdyp.geometry)::jsonb,
                    'properties', jsonb_build_object(
                    'id', sdyp.id,
                    'regionId', sdyp.region_id,
                    'date', sdyp.cls_edate,
                    'subDistrict', jsonb_build_object(
                    'en', sdyp.o_adm3e ,
                    'th', sdyp.o_adm3t
                    ),
                    'district', jsonb_build_object(
                    'en', sdyp.o_adm2e ,
                    'th', sdyp.o_adm2t
                    ),
                    'province', jsonb_build_object(
                    'en', sdyp.o_adm1e ,
                    'th', sdyp.o_adm1t
                    ),
                    'area', jsonb_build_object(
                    'm2', sdyp.area_m2 ,
                    'km2', sdyp.area_km2, 
                    'rai', sdyp.area_rai , 
                    'hexa', sdyp.area_hexa
                    )
                    )
                ) AS geojson
                `,
			)
			.where('sdyp.region_id IS NOT NULL')

		if (payload.startDate && payload.endDate) {
			queryBuilderYieldPred.andWhere('DATE(sdyp.cls_edate) BETWEEN :startDate AND :endDate', {
				startDate: payload.startDate,
				endDate: payload.endDate,
			})
		}
		queryBuilderYieldPred.limit(100) //TODO
		const yieldPred: GetPlantBurntAreaDtoOut[] = await queryBuilderYieldPred.getRawMany().then((data) => {
			return data.map((item) => item.geojson)
		})
		res.setHeader('Cache-Control', 'public, max-age=3600')
		return res.json({
			data: yieldPred,
		})
	}

	@Get('dashboard')
	async getDashBoard(
		@Query() payload: GetDashBoardBurntAreaDtoIn,
	): Promise<ResponseDto<GetDashBoardBurntAreaDtoOut>> {
		let objResponse = {}
		const mapTypeFilter = payload.mapType ? validatePayload(payload.mapType) : []

		if (payload.startDate && payload.endDate) {
			const validateDate = validateDateRange(new Date(payload.startDate), new Date(payload.endDate))
			if (validateDate) throw new BadRequestException('Date Error')
		}

		if (mapTypeFilter.includes(mapTypeCode.hotspots)) {
			const hotspotData = await this.burntAreaService.hotspotService(payload)
			objResponse = {
				...objResponse,
				hotspot: hotspotData,
			}
		}

		if (mapTypeFilter.includes(mapTypeCode.burnArea)) {
			const burnAreaData = await this.burntAreaService.burnAreaService(payload)
			objResponse = {
				...objResponse,
				burnArea: burnAreaData,
			}
		}

		if (mapTypeFilter.includes(mapTypeCode.plant)) {
			const yieldPredData = await this.burntAreaService.yieldPredService(payload)
			objResponse = {
				...objResponse,
				plant: yieldPredData,
			}
		}

		return new ResponseDto<GetDashBoardBurntAreaDtoOut>({ data: objResponse })
	}

	@Get('identify')
	async getIdentify(@Query() payload: GetIdentifyBurntAreaDtoIn): Promise<ResponseDto<GetIdentifyBurntAreaDtoOut>> {
		const queryResult = await this.dataSource
			.query(
				` WITH hotspots AS (
                    SELECT ST_AsGeoJSON(geometry),
                    'hotspots' AS source_table
                    FROM sugarcane.sugarcane.sugarcane_hotspot
                    WHERE ST_DWithin(geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326), 0.00001)
                ),
                burn_area AS (
                    SELECT ST_AsGeoJSON(geometry),
                    'burn_area' AS source_table 
                    FROM sugarcane.sugarcane.sugarcane_ds_burn_area
                    WHERE ST_DWithin(geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326), 0.00001)
                ),
                yield_pred AS (
                    SELECT ST_AsGeoJSON(geometry),
                    'yield_pred' AS source_table
                    FROM sugarcane.sugarcane.sugarcane_ds_yield_pred
                    WHERE ST_DWithin(geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326), 0.00001)
                )
                SELECT * FROM hotspots
                UNION
                SELECT * FROM burn_area
                UNION
                SELECT * FROM yield_pred;
			`,
				[100.983977445, 15.549116555],
			)
			.then((data) =>
				data.map((item) => {
					return {
						...item,
						st_asgeojson: JSON.parse(item.st_asgeojson),
					}
				}),
			)
		return new ResponseDto<GetIdentifyBurntAreaDtoOut>({ data: queryResult })
	}

	@Get('hotspot-calendar')
	async getHotspotCalendar(
		@Query() payload: GetHotspotCalendarDtoIn,
	): Promise<ResponseDto<GetHotspotCalendarDtoOut>> {
		const queryBuilderHotspot = await await this.dataSource
			.query(
				`
			SELECT 
				TO_CHAR(sh.acq_date, 'YYYY-MM-DD') AS acq_date
			FROM 
				sugarcane.sugarcane.sugarcane_hotspot sh
			WHERE
				sh.region_id notnull 
			GROUP BY 
				TO_CHAR(sh.acq_date, 'YYYY-MM-DD')
			ORDER BY 
				TO_CHAR(sh.acq_date, 'YYYY-MM-DD') ASC;
			`,
			)
			.then((data) => {
				return data.map((item) => item.acq_date)
			})
		return new ResponseDto<GetHotspotCalendarDtoOut>({ data: queryBuilderHotspot })
	}
}
