import { ResponseDto, yieldMapTypeCode } from '@interface/config/app.config'
import { errorResponse } from '@interface/config/error.config'
import {
	GetDashboardYieldAreaDtoIn,
	GetPlantYieldAreaDtoIn,
	GetProductYieldAreaDtoIn,
	GetReplantYieldAreaDtoIn,
} from '@interface/dto/yield-area/yield-area.dto-in'
import {
	GetDashboardYieldAreaDtoOut,
	GetPlantYieldAreaDtoOut,
	GetProductYieldAreaDtoOut,
} from '@interface/dto/yield-area/yield-area.dto-out'
import { SugarcaneDsRepeatAreaEntity, SugarcaneDsYieldPredEntity } from '@interface/entities'
import { Controller, Get, Query, Res, BadRequestException, UseGuards } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { AuthGuard } from 'src/core/auth.guard'
import { convertPolygonToWKT, getRound, validateDate, validatePayload } from 'src/core/utils'
import { Repository } from 'typeorm'
import { YieldService } from './yield-area.service'
import * as moment from 'moment-timezone'

@Controller('yield-area')
export class YieldAreaController {
	constructor(
		@InjectRepository(SugarcaneDsYieldPredEntity)
		private readonly sugarcaneDsYieldPredEntity: Repository<SugarcaneDsYieldPredEntity>,

		@InjectRepository(SugarcaneDsRepeatAreaEntity)
		private readonly sugarcaneDsRepeatAreaEntity: Repository<SugarcaneDsRepeatAreaEntity>,

		private readonly yieldService: YieldService,
	) {}

	@Get('product')
	@UseGuards(AuthGuard)
	async getProduct(
		@Query() payload: GetProductYieldAreaDtoIn,
		@Res() res,
	): Promise<ResponseDto<GetProductYieldAreaDtoOut[]>> {
		let yieldProduct: GetProductYieldAreaDtoOut[] = []
		if (validateDate(payload.startDate, payload.endDate)) throw new BadRequestException(errorResponse.INVALID_DATE)
		if (payload.admC || payload.polygon) {
			const queryBuilderProduct = this.sugarcaneDsYieldPredEntity
				.createQueryBuilder('sdyp')
				.select(
					`
                    jsonb_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(sdyp.geometry)::jsonb,
                    'properties', jsonb_build_object(
                        'date', TO_CHAR(sdyp.cls_edate,'YYYY-MM-DD'),
                        'area',jsonb_build_object(
                            'm2', sdyp.area_m2,
                            'km2', sdyp.area_km2,
                            'rai', sdyp.area_rai,
                            'hexa', sdyp.area_hexa 
                        ),
						'adm', jsonb_build_object( 
							'en', sdyp.o_adm3e || ' ' || sdyp.o_adm2e || ' ' || sdyp.o_adm1e,
							'th', sdyp.o_adm3t || ' ' || sdyp.o_adm2t || ' ' || sdyp.o_adm1t
						), 
                        'product',jsonb_build_object(
                            'kg', jsonb_build_object(
                                'm2', sdyp.yield_mean_kg_m2 ,
                                'km2', sdyp.yield_mean_kg_km2 ,
                                'rai', sdyp.yield_mean_kg_rai ,
                                'hexa', sdyp.yield_mean_kg_hexa
                            ),
                            'ton', jsonb_build_object(
                                'm2', sdyp.yield_mean_ton_m2,
                                'km2', sdyp.yield_mean_ton_km2,
                                'rai', sdyp.yield_mean_ton_rai,
                                'hexa', sdyp.yield_mean_ton_hexa
                            )     	
                        ),
                        'volumn',jsonb_build_object(
                            'ton', sdyp.production_ton,
                            'kg', sdyp.production_kg 
                        )
                    )
                    ) as geojson
                `,
				)
				.where('sdyp.region_id IS NOT NULL')

			// เอา endDate ไปหาว่าข้อมูลตกในรอบไหนแล้วเอามาแสดง
			if (payload.endDate) {
				const dataSplit = payload.endDate.split('-')
				const month = Number(dataSplit[1])
				const year = Number(dataSplit[0])
				const round = getRound(month, year)
				queryBuilderProduct.andWhere({ clsRound: round.round })
				queryBuilderProduct.andWhere('sdyp.cls_sdate >= :startDate AND sdyp.cls_edate <= :endDate', {
					startDate: round.sDate,
					endDate: round.eDate,
				})
			}

			if (payload.admC) {
				queryBuilderProduct.andWhere('(sdyp.o_adm1c = :admc or sdyp.o_adm2c = :admc or sdyp.o_adm3c = :admc)', {
					admc: payload.admC,
				})
			}
			if (payload.polygon) {
				const formatePolygon = convertPolygonToWKT(JSON.parse(payload.polygon))
				queryBuilderProduct.andWhere('ST_Within(sdyp.geometry, ST_GeomFromText(:polygon, 4326))', {
					polygon: formatePolygon,
				})
			}

			yieldProduct = await queryBuilderProduct.getRawMany().then((data) => {
				return data.map((item) => item.geojson)
			})
		}

		res.setHeader('Cache-Control', 'public, max-age=3600')
		return res.json({
			data: yieldProduct,
		})
	}

	@Get('replant')
	@UseGuards(AuthGuard)
	async getReplant(
		@Query() payload: GetReplantYieldAreaDtoIn,
		@Res() res,
	): Promise<ResponseDto<GetReplantYieldAreaDtoIn[]>> {
		let yieldReplant: GetReplantYieldAreaDtoIn[] = []
		if (validateDate(payload.startDate, payload.endDate)) throw new BadRequestException(errorResponse.INVALID_DATE)
		if (payload.admC || payload.polygon) {
			const queryBuilderRePlant = this.sugarcaneDsRepeatAreaEntity
				.createQueryBuilder('sdra')
				.select(
					`
                    jsonb_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(sdra.geometry)::jsonb,
                    'properties', jsonb_build_object(
                        'date', TO_CHAR(sdra.cls_edate,'YYYY-MM-DD'),
                        'repeat', sdra.repeat,
						 'adm', jsonb_build_object( 
							'en', sdra.o_adm3e || ' ' || sdra.o_adm2e || ' ' || sdra.o_adm1e,
							'th', sdra.o_adm3t || ' ' || sdra.o_adm2t || ' ' || sdra.o_adm1t
						),
                        'area',jsonb_build_object(
                            'm2', sdra.area_m2,
                            'km2', sdra.area_km2,
                            'rai', sdra.area_rai,
                            'hexa', sdra.area_hexa
                        )
                    )
                    ) as geojson
                `,
				)
				.where('sdra.region_id IS NOT NULL')
			if (payload.repeat) {
				queryBuilderRePlant.andWhere('sdra.repeat = :repeat', {
					repeat: payload.repeat,
				})
			}

			// เอา endDate ไปหาว่าข้อมูลตกในรอบไหนแล้วเอามาแสดง
			if (payload.endDate) {
				const dataSplit = payload.endDate.split('-')
				const month = Number(dataSplit[1])
				const year = Number(dataSplit[0])
				const round = getRound(month, year)
				console.log('👻 round1: ', round)

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

			yieldReplant = await queryBuilderRePlant.getRawMany().then((data) => {
				return data.map((item) => item.geojson)
			})
		}

		res.setHeader('Cache-Control', 'public, max-age=3600')
		return res.json({
			data: yieldReplant,
		})
	}

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
