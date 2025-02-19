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
	// @UseGuards(AuthGuard)
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
	// @UseGuards(AuthGuard)
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
	// @UseGuards(AuthGuard)
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
				` WITH point AS (
					SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 32647) AS geom
				),
				buffer AS (
					SELECT ST_Transform(ST_Buffer(geom, 100), 4326) AS buffered_geom  -- Buffer ด้วยระบบพิกัด UTM แล้วแปลงกลับเป็น 4326
					FROM point
				)
				select
					t1.id AS table1_id,
					t2.id AS table2_id,
					t3.id AS table3_id,
					ST_AsGeoJSON(t1.geometry)::jsonb AS table1_geometry,
					ST_AsGeoJSON(t2.geometry)::jsonb AS table2_geometry,
					ST_AsGeoJSON(t3.geometry)::jsonb AS table3_geometry
				FROM
					buffer b
				LEFT JOIN (
					SELECT DISTINCT id, geometry
					FROM sugarcane.sugarcane.sugarcane_hotspot
				) t1 ON ST_Intersects(t1.geometry, b.buffered_geom)
				LEFT JOIN (
					SELECT DISTINCT id, geometry
					FROM sugarcane.sugarcane.sugarcane_ds_burn_area
				) t2 ON ST_Intersects(t2.geometry, b.buffered_geom) 
				LEFT JOIN (
					SELECT DISTINCT id, geometry
					FROM sugarcane.sugarcane.sugarcane_ds_yield_pred 
				) t3 ON ST_Intersects(t3.geometry, b.buffered_geom)
				group by ST_AsGeoJSON(t1.geometry),ST_AsGeoJSON(t2.geometry),ST_AsGeoJSON(t3.geometry),t1.id,t2.id,t3.id
				order by t1.id,t2.id,t3.id
			`,
				[100.6554394, 16.1109496],
			)
			// .then((data) =>
			// 	data.map((item) => {
			// 		return {
			// 			...item,
			// 			st_asgeojson: JSON.parse(item.st_asgeojson),
			// 		}
			// 	}),
			// )
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
