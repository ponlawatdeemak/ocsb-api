import { hotspotTypeCode, mapTypeCode, ResponseDto } from '@interface/config/app.config'
import {
	GetBurntBurntAreaDtoIn,
	GetDashBoardBurntAreaDtoIn,
	GetHotspotBurntAreaDtoIn,
	GetPlantBurntAreaDtoIn,
} from '@interface/dto/brunt-area/brunt-area.dto-in'
import {
	GetBurntBurntAreaDtoOut,
	GetDashBoardBurntAreaDtoOut,
	GetHotspotBurntAreaDtoOut,
	GetBurnAreaCalendarDtoOut,
	GetPlantBurntAreaDtoOut,
} from '@interface/dto/brunt-area/brunt-area.dto.out'
import { SugarcaneDsBurnAreaDailyEntity, SugarcaneDsYieldPredEntity, SugarcaneHotspotEntity } from '@interface/entities'
import { Controller, Get, Query, UseGuards, Res, BadRequestException } from '@nestjs/common'
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm'
import { AuthGuard } from 'src/core/auth.guard'
import { convertPolygonToWKT, getRound, validateDate, validatePayload } from 'src/core/utils'
import { Repository, DataSource } from 'typeorm'
import { BurntAreaService } from './burnt-area.service'
import { errorResponse } from '@interface/config/error.config'

@Controller('brunt-area')
export class BurntAreaController {
	constructor(
		@InjectDataSource()
		private readonly dataSource: DataSource,

		@InjectRepository(SugarcaneHotspotEntity)
		private readonly sugarcaneHotspotEntity: Repository<SugarcaneHotspotEntity>,

		@InjectRepository(SugarcaneDsBurnAreaDailyEntity)
		private readonly sugarcaneDsBurnAreaEntity: Repository<SugarcaneDsBurnAreaDailyEntity>,

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
		const inSugarcaneFilter = payload?.inSugarcan ? validatePayload(JSON.parse(payload?.inSugarcan as any)) : []

		let hotspots: GetHotspotBurntAreaDtoOut[] = []
		if (validateDate(payload.startDate, payload.endDate)) throw new BadRequestException(errorResponse.INVALID_DATE)

		if (inSugarcaneFilter.length !== 0 && (payload.admC || payload.polygon)) {
			const queryBuilderHotspot = this.sugarcaneHotspotEntity
				.createQueryBuilder('sh')
				.select(
					`
                jsonb_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(sh.geometry)::jsonb,
                'properties', jsonb_build_object(
                    'id', sh.id,
                    'regionId', sh.region_id,
                    'date', sh.acq_date,
					'adm1',jsonb_build_object(
						'en', sh.o_adm1e,
						'th', sh.o_adm1t
					),
					'adm2',jsonb_build_object(
						'en', sh.o_adm2e,
						'th', sh.o_adm2t
					),
						'adm3',jsonb_build_object(
						'en', sh.o_adm3e,
						'th', sh.o_adm3t
					)
                ) 
                ) as geojson
                `,
				)
				.where('sh.region_id IS NOT NULL')

			if (inSugarcaneFilter.length === 1) {
				queryBuilderHotspot.andWhere({ inSugarcane: inSugarcaneFilter[0] === hotspotTypeCode.inSugarcan })
			}

			if (payload.startDate && payload.endDate) {
				queryBuilderHotspot.andWhere('DATE(sh.acq_date) BETWEEN :startDate AND :endDate', {
					startDate: payload.startDate,
					endDate: payload.endDate,
				})
			}
			if (payload.admC) {
				queryBuilderHotspot.andWhere('(sh.o_adm1c = :admc or sh.o_adm2c = :admc or sh.o_adm3c = :admc)', {
					admc: payload.admC,
				})
			}
			if (payload.polygon) {
				const formatePolygon = convertPolygonToWKT(JSON.parse(payload.polygon))
				queryBuilderHotspot.andWhere('ST_Intersects(sh.geometry, ST_GeomFromText(:polygon, 4326))', {
					polygon: formatePolygon,
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
		let burnArea: GetBurntBurntAreaDtoOut[] = []
		if (validateDate(payload.startDate, payload.endDate)) throw new BadRequestException(errorResponse.INVALID_DATE)
		if (payload.admC || payload.polygon) {
			const queryBuilderBurnArea = this.sugarcaneDsBurnAreaEntity
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
                    'adm3', jsonb_build_object(
                    'en', sdba.o_adm3e ,
                    'th', sdba.o_adm3t
                    ),
                    'adm2', jsonb_build_object(
                    'en', sdba.o_adm2e ,
                    'th', sdba.o_adm2t
                    ),
                    'adm1', jsonb_build_object(
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

			if (payload.admC) {
				queryBuilderBurnArea.andWhere(
					'(sdba.o_adm1c = :admc or sdba.o_adm2c = :admc or sdba.o_adm3c = :admc)',
					{
						admc: payload.admC,
					},
				)
			}

			if (payload.polygon) {
				const formatePolygon = convertPolygonToWKT(JSON.parse(payload.polygon))
				queryBuilderBurnArea.andWhere('ST_Intersects(sdba.geometry, ST_GeomFromText(:polygon, 4326))', {
					polygon: formatePolygon,
				})
			}

			burnArea = await queryBuilderBurnArea.getRawMany().then((data) => {
				return data.map((item) => item.geojson)
			})
			res.setHeader('Cache-Control', 'public, max-age=3600')
		}
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
		let yieldPred: GetPlantBurntAreaDtoOut[] = []
		if (validateDate(payload.startDate, payload.endDate)) throw new BadRequestException(errorResponse.INVALID_DATE)
		if (payload.admC || payload.polygon) {
			const queryBuilderYieldPred = this.sugarcaneDsYieldPredEntity
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
                    'adm3', jsonb_build_object(
                    'en', sdyp.o_adm3e ,
                    'th', sdyp.o_adm3t
                    ),
                    'adm2', jsonb_build_object(
                    'en', sdyp.o_adm2e ,
                    'th', sdyp.o_adm2t
                    ),
                    'adm1', jsonb_build_object(
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

			// เอา endDate ไปหาว่าข้อมูลตกในรอบไหนแล้วเอามาแสดง
			if (payload.endDate) {
				const dataSplit = payload.endDate.split('-')
				const month = Number(dataSplit[1])
				const year = Number(dataSplit[0])
				const round = getRound(month, year)
				queryBuilderYieldPred.andWhere({ clsRound: round.round })
				queryBuilderYieldPred.andWhere('sdyp.cls_sdate >= :startDate AND sdyp.cls_edate <= :endDate', {
					startDate: round.sDate,
					endDate: round.eDate,
				})
			}

			if (payload.admC) {
				queryBuilderYieldPred.andWhere(
					'(sdyp.o_adm1c = :admc or sdyp.o_adm2c = :admc or sdyp.o_adm3c = :admc)',
					{ admc: payload.admC },
				)
			}
			if (payload.polygon) {
				const formatePolygon = convertPolygonToWKT(JSON.parse(payload.polygon))
				queryBuilderYieldPred.andWhere('ST_Intersects(sdyp.geometry, ST_GeomFromText(:polygon, 4326))', {
					polygon: formatePolygon,
				})
			}

			yieldPred = await queryBuilderYieldPred.getRawMany().then((data) => {
				return data.map((item) => item.geojson)
			})

			res.setHeader('Cache-Control', 'public, max-age=3600')
		}
		return res.json({
			data: yieldPred,
		})
	}

	@Get('dashboard')
	@UseGuards(AuthGuard)
	async getDashBoard(
		@Query() payload: GetDashBoardBurntAreaDtoIn,
	): Promise<ResponseDto<GetDashBoardBurntAreaDtoOut>> {
		let objResponse = {}
		const mapTypeFilter = payload.mapType ? validatePayload(payload.mapType) : []
		if (validateDate(payload.startDate, payload.endDate)) throw new BadRequestException(errorResponse.INVALID_DATE)

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

	@Get('burn-area-calendar')
	@UseGuards(AuthGuard)
	async getHotspotCalendar(): Promise<ResponseDto<GetBurnAreaCalendarDtoOut[]>> {
		const queryBuilderHotspot = await this.dataSource
			.query(
				`
			SELECT 
				TO_CHAR(sdba.detected_d , 'YYYY-MM-DD') AS detected_d
			FROM 
				sugarcane.sugarcane.sugarcane_ds_burn_area_daily sdba 
			GROUP BY 
				TO_CHAR(sdba.detected_d, 'YYYY-MM-DD')
			ORDER BY 
				TO_CHAR(sdba.detected_d, 'YYYY-MM-DD') ASC;
			`,
			)
			.then((data) => {
				return data.map((item) => item.detected_d)
			})
		return new ResponseDto<GetBurnAreaCalendarDtoOut[]>({ data: queryBuilderHotspot })
	}
}
