import { hotspotTypeCode, mapTypeCode, ResponseDto, yieldMapTypeCode } from '@interface/config/app.config'
import { GetDashBoardBurntAreaDtoIn, GetPrintInfoBurntDtoIn } from '@interface/dto/burnt-area/burnt-area.dto-in'
import {
	GetDashBoardBurntAreaDtoOut,
	GetBurnAreaCalendarDtoOut,
	GetPrintInfoBurntDtoOut,
} from '@interface/dto/burnt-area/burnt-area.dto.out'
import {
	SugarcaneDsBurnAreaDailyEntity,
	SugarcaneDsRepeatAreaEntity,
	SugarcaneDsYieldPredEntity,
	SugarcaneHotspotEntity,
} from '@interface/entities'
import { Controller, Get, Query, UseGuards, BadRequestException } from '@nestjs/common'
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm'
import { AuthGuard } from 'src/core/auth.guard'
import { convertPolygonToWKT, getRound, validateDate, validatePayload } from 'src/core/utils'
import { Repository, DataSource } from 'typeorm'
import { BurntAreaService } from './burnt-area.service'
import { errorResponse } from '@interface/config/error.config'
import * as moment from 'moment-timezone'

@Controller('burnt-area')
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

		@InjectRepository(SugarcaneDsRepeatAreaEntity)
		private readonly sugarcaneDsRepeatAreaEntity: Repository<SugarcaneDsRepeatAreaEntity>,

		private readonly burntAreaService: BurntAreaService,
	) {}

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
				sugarcane.sugarcane_ds_burn_area_daily sdba 
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

	@Get('print-info')
	@UseGuards(AuthGuard)
	async getPrintInfo(@Query() payload: GetPrintInfoBurntDtoIn): Promise<ResponseDto<GetPrintInfoBurntDtoOut>> {
		const result: GetPrintInfoBurntDtoOut = {
			hotspot: 0,
			burnArea: { m2: 0, km2: 0, rai: 0, hexa: 0 },
			plant: { m2: 0, km2: 0, rai: 0, hexa: 0 },
			product: { kg: 0, ton: 0 },
			repeat: { m2: 0, km2: 0, rai: 0, hexa: 0 },
		}
		if (payload.mapType.includes(mapTypeCode.hotspots)) {
			result.hotspot = await this.getHotspotCount(payload)
		}
		if (payload.mapType.includes(mapTypeCode.burnArea)) {
			const resBurnt = await this.getBurnt(payload)
			result.burnArea.rai = resBurnt.area_rai
			result.burnArea.m2 = resBurnt.area_m2
			result.burnArea.km2 = resBurnt.area_km2
			result.burnArea.hexa = resBurnt.area_hexa
		}
		if (payload.mapType.includes(mapTypeCode.plant) || payload.mapType.includes(yieldMapTypeCode.product)) {
			const resPlant = await this.getPlant(payload)
			result.plant.rai = resPlant.area_rai
			result.plant.m2 = resPlant.area_m2
			result.plant.km2 = resPlant.area_km2
			result.plant.hexa = resPlant.area_hexa
			result.product.kg = resPlant.production_kg
			result.product.ton = resPlant.production_ton
		}
		if (payload.repeat) {
			const resReplant = await this.getRepeat(payload)
			result.repeat.rai = resReplant.area_rai
			result.repeat.m2 = resReplant.area_m2
			result.repeat.km2 = resReplant.area_km2
			result.repeat.hexa = resReplant.area_hexa
		}

		return new ResponseDto({ data: result })
	}

	getHotspotCount = async (payload: GetPrintInfoBurntDtoIn) => {
		const queryBuilderHotspot = this.sugarcaneHotspotEntity
			.createQueryBuilder('sh')
			.where('sh.region_id IS NOT NULL')

		if (payload.inSugarcan.length === 1) {
			queryBuilderHotspot.andWhere({ inSugarcane: payload.inSugarcan[0] === hotspotTypeCode.inSugarcan })
		}

		if (payload.startDate && payload.endDate) {
			queryBuilderHotspot.andWhere(`DATE(sh.acq_date + INTERVAL '7 hour') BETWEEN :startDate AND :endDate`, {
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
		return await queryBuilderHotspot.getCount()
	}

	getBurnt = async (payload: GetPrintInfoBurntDtoIn) => {
		const queryBuilderBurnArea = this.sugarcaneDsBurnAreaEntity
			.createQueryBuilder('sdba')
			.select('1', 'temp')
			.where('sdba.region_id IS NOT NULL')
		if (payload.startDate && payload.endDate) {
			queryBuilderBurnArea.andWhere('DATE(sdba.detected_d) BETWEEN :startDate AND :endDate', {
				startDate: payload.startDate,
				endDate: payload.endDate,
			})
		}

		if (payload.admC) {
			queryBuilderBurnArea.andWhere('(sdba.o_adm1c = :admc or sdba.o_adm2c = :admc or sdba.o_adm3c = :admc)', {
				admc: payload.admC,
			})
		}

		if (payload.polygon) {
			const formatePolygon = convertPolygonToWKT(JSON.parse(payload.polygon))
			queryBuilderBurnArea.andWhere('ST_Intersects(sdba.geometry, ST_GeomFromText(:polygon, 4326))', {
				polygon: formatePolygon,
			})
		}
		queryBuilderBurnArea.addSelect('SUM(sdba.area_rai)', 'area_rai')
		queryBuilderBurnArea.addSelect('SUM(sdba.area_m2)', 'area_m2')
		queryBuilderBurnArea.addSelect('SUM(sdba.area_km2)', 'area_km2')
		queryBuilderBurnArea.addSelect('SUM(sdba.area_hexa)', 'area_hexa')
		return await queryBuilderBurnArea.getRawOne()
	}

	async getPlant(payload: GetPrintInfoBurntDtoIn) {
		const queryBuilderYieldPred = this.sugarcaneDsYieldPredEntity
			.createQueryBuilder('sdyp')
			.select('1', 'temp') // for force typeorm do not fill all column
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
			queryBuilderYieldPred.andWhere('(sdyp.o_adm1c = :admc or sdyp.o_adm2c = :admc or sdyp.o_adm3c = :admc)', {
				admc: payload.admC,
			})
		}
		if (payload.polygon) {
			const formatePolygon = convertPolygonToWKT(JSON.parse(payload.polygon))
			queryBuilderYieldPred.andWhere('ST_Intersects(sdyp.geometry, ST_GeomFromText(:polygon, 4326))', {
				polygon: formatePolygon,
			})
		}
		queryBuilderYieldPred.addSelect('SUM(sdyp.area_rai)', 'area_rai')
		queryBuilderYieldPred.addSelect('SUM(sdyp.area_m2)', 'area_m2')
		queryBuilderYieldPred.addSelect('SUM(sdyp.area_km2)', 'area_km2')
		queryBuilderYieldPred.addSelect('SUM(sdyp.area_hexa)', 'area_hexa')
		queryBuilderYieldPred.addSelect('SUM(sdyp.production_ton)', 'production_ton')
		queryBuilderYieldPred.addSelect('SUM(sdyp.production_kg)', 'production_kg')

		return await queryBuilderYieldPred.getRawOne()
	}

	async getRepeat(payload: GetPrintInfoBurntDtoIn) {
		const queryBuilderRePlant = this.sugarcaneDsRepeatAreaEntity
			.createQueryBuilder('sdra')
			.select('1', 'temp')
			.where('sdra.region_id IS NOT NULL')
		queryBuilderRePlant.andWhere('sdra.repeat = :repeat', {
			repeat: payload.repeat,
		})

		// เอา endDate ไปหาว่าข้อมูลตกในรอบไหนแล้วเอามาแสดง
		if (payload.endDate) {
			const dataSplit = payload.endDate.split('-')
			const month = Number(dataSplit[1])
			const year = Number(dataSplit[0])
			const round = getRound(month, year)

			if (round.round !== 1) {
				// ถ้าได้รอบ 2,3 ให้ไปใช้รอบ 1 ของปีนั้น
				let monthDown
				if (round.round === 2) {
					monthDown = 4
				} else if (round.round === 3) {
					monthDown = 8
				}
				let sDate = moment(round.sDate).subtract(monthDown, 'months').toISOString().substring(0, 10)
				const sDateSpliter = sDate.split('-')
				const isEndMonth = Number(sDateSpliter[2]) === 31
				if (isEndMonth) {
					sDate = moment(sDate).add(2, 'days').toISOString().substring(0, 10)
				}

				const eDate = moment(round.eDate)
					.subtract(monthDown, 'months')
					.endOf('month')
					.toISOString()
					.substring(0, 10)

				round.round = 1
				round.sDate = sDate
				round.eDate = eDate
			}
			queryBuilderRePlant.andWhere({ clsRound: round.round })
			// queryBuilderRePlant.andWhere('sdra.cls_edate <= :endDate', { endDate: round.eDate })
			queryBuilderRePlant.andWhere('sdra.cls_sdate >= :startDate AND sdra.cls_edate <= :endDate', {
				startDate: round.sDate,
				endDate: round.eDate,
			})
		}

		if (payload.admC) {
			queryBuilderRePlant.andWhere('(sdra.o_adm1c = :admc or sdra.o_adm2c = :admc or sdra.o_adm3c = :admc)', {
				admc: payload.admC,
			})
		}
		if (payload.polygon) {
			const formatePolygon = convertPolygonToWKT(JSON.parse(payload.polygon))
			queryBuilderRePlant.andWhere('ST_Within(sdra.geometry, ST_GeomFromText(:polygon, 4326))', {
				polygon: formatePolygon,
			})
		}
		queryBuilderRePlant.addSelect('SUM(sdra.area_rai)', 'area_rai')
		queryBuilderRePlant.addSelect('SUM(sdra.area_m2)', 'area_m2')
		queryBuilderRePlant.addSelect('SUM(sdra.area_km2)', 'area_km2')
		queryBuilderRePlant.addSelect('SUM(sdra.area_hexa)', 'area_hexa')

		return await queryBuilderRePlant.getRawOne()
	}
}
