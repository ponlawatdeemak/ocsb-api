import { GetDashboardYieldAreaDtoIn } from '@interface/dto/yield-area/yield-area.dto-in'
import { SugarcaneDsYieldPredEntity } from '@interface/entities'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { getRound } from 'src/core/utils'
import { Repository } from 'typeorm'

@Injectable()
export class YieldService {
	constructor(
		@InjectRepository(SugarcaneDsYieldPredEntity)
		private readonly sugarcaneDsYieldPredEntity: Repository<SugarcaneDsYieldPredEntity>,
	) {}

	async getPlant(payload: GetDashboardYieldAreaDtoIn) {
		const queryBuilderPlantTotal = this.sugarcaneDsYieldPredEntity
			.createQueryBuilder('sdyp')
			.select(
				`
                sum(sdyp.area_m2) as m2,
                sum(sdyp.area_km2) as km2,
                sum(sdyp.area_rai) as rai,
                sum(sdyp.area_hexa) as hexa
                `,
			)
			.where('sdyp.region_id IS NOT NULL')

		const queryBuilderPlantResult = this.sugarcaneDsYieldPredEntity
			.createQueryBuilder('sdyp')
			.select(
				`
                sum(sdyp.area_m2) as m2,
                sum(sdyp.area_km2) as km2,
                sum(sdyp.area_rai) as rai,
                sum(sdyp.area_hexa) as hexa
                `,
			)
			.where('sdyp.region_id IS NOT NULL')

		// if (payload.startDate && payload.endDate) {
		// 	queryBuilderPlantTotal.andWhere('sdyp.cls_edate BETWEEN :startDate AND :endDate', {
		// 		startDate: payload.startDate,
		// 		endDate: payload.endDate,
		// 	})
		// 	queryBuilderPlantResult.andWhere('sdyp.cls_edate BETWEEN :startDate AND :endDate', {
		// 		startDate: payload.startDate,
		// 		endDate: payload.endDate,
		// 	})
		// }
		// เอา endDate ไปหาว่าข้อมูลตกในรอบไหนแล้วเอามาแสดง
		if (payload.endDate) {
			const dataSplit = payload.endDate.split('-')
			const month = Number(dataSplit[1])
			const year = Number(dataSplit[0])
			const round = getRound(month, year)
			queryBuilderPlantTotal.andWhere({ clsRound: round.round })
			queryBuilderPlantTotal.andWhere('sdyp.cls_sdate >= :startDate AND sdyp.cls_edate <= :endDate', {
				startDate: round.sDate,
				endDate: round.eDate,
			})

			queryBuilderPlantResult.andWhere({ clsRound: round.round })
			queryBuilderPlantResult.andWhere('sdyp.cls_sdate >= :startDate AND sdyp.cls_edate <= :endDate', {
				startDate: round.sDate,
				endDate: round.eDate,
			})
		}

		if (payload.admC) {
			queryBuilderPlantResult.andWhere('(sdyp.o_adm1c = :admc or sdyp.o_adm2c = :admc or sdyp.o_adm3c = :admc)', {
				admc: payload.admC,
			})
		}

		const [totalPlant, resultPlant] = await Promise.all([
			queryBuilderPlantTotal.getRawOne(),
			queryBuilderPlantResult.getRawOne(),
		])

		return {
			total: totalPlant,
			area: resultPlant,
			diffArea: {
				m2: totalPlant.m2 - resultPlant.m2,
				km2: totalPlant.km2 - resultPlant.km2,
				rai: totalPlant.rai - resultPlant.rai,
				hexa: totalPlant.hexa - resultPlant.hexa,
			},
		}
	}

	async getProduct(payload: GetDashboardYieldAreaDtoIn) {
		const queryBuilderSumCoun = this.sugarcaneDsYieldPredEntity
			.createQueryBuilder('sdyp')
			.select(
				`
                sum(sdyp.yield_coun) as coun,
                jsonb_build_object (
                    'm2', (sum(sdyp.yield_sum_ton_m2)),
                    'km2', (sum(sdyp.yield_sum_ton_km2)),
                    'rai', (sum(sdyp.yield_sum_ton_rai)),
                    'hexa', (sum(sdyp.yield_sum_ton_hexa))
                    ) as ton,
                jsonb_build_object (
                    'm2', (sum(sdyp.yield_sum_kg_m2)),
                    'km2', (sum(sdyp.yield_sum_kg_km2)),
                    'rai', (sum(sdyp.yield_sum_kg_rai)),
                    'hexa', (sum(sdyp.yield_sum_kg_hexa))
                    ) as kg
            `,
			)
			.where('sdyp.region_id IS NOT NULL')
		const queryBuilderProductTotal = this.sugarcaneDsYieldPredEntity
			.createQueryBuilder('sdyp')
			.select(
				`
           sum(sdyp.production_ton) as ton,
           sum(sdyp.production_kg) as kg
            `,
			)
			.where('sdyp.region_id IS NOT NULL')

		const queryBuilderProductResult = this.sugarcaneDsYieldPredEntity
			.createQueryBuilder('sdyp')
			.select(
				`
            sum(sdyp.production_ton) as ton,
            sum(sdyp.production_kg) as kg
            `,
			)
			.where('sdyp.region_id IS NOT NULL')

		if (payload.endDate) {
			const dataSplit = payload.endDate.split('-')
			const month = Number(dataSplit[1])
			const year = Number(dataSplit[0])
			const round = getRound(month, year)
			queryBuilderSumCoun.andWhere({ clsRound: round.round })
			queryBuilderSumCoun.andWhere('sdyp.cls_sdate >= :startDate AND sdyp.cls_edate <= :endDate', {
				startDate: round.sDate,
				endDate: round.eDate,
			})

			queryBuilderProductTotal.andWhere({ clsRound: round.round })
			queryBuilderProductTotal.andWhere('sdyp.cls_sdate >= :startDate AND sdyp.cls_edate <= :endDate', {
				startDate: round.sDate,
				endDate: round.eDate,
			})

			queryBuilderProductResult.andWhere({ clsRound: round.round })
			queryBuilderProductResult.andWhere('sdyp.cls_sdate >= :startDate AND sdyp.cls_edate <= :endDate', {
				startDate: round.sDate,
				endDate: round.eDate,
			})
		}

		if (payload.admC) {
			queryBuilderSumCoun.andWhere('(sdyp.o_adm1c = :admc or sdyp.o_adm2c = :admc or sdyp.o_adm3c = :admc)', {
				admc: payload.admC,
			})
			queryBuilderProductResult.andWhere(
				'(sdyp.o_adm1c = :admc or sdyp.o_adm2c = :admc or sdyp.o_adm3c = :admc)',
				{ admc: payload.admC },
			)
		}
		const [average, totalProduct, resultProduct] = await Promise.all([
			queryBuilderSumCoun.getRawOne(),
			queryBuilderProductTotal.getRawOne(),
			queryBuilderProductResult.getRawOne(),
		])

		return {
			total: totalProduct,
			result: resultProduct,
			diffResult: {
				ton: totalProduct.ton - resultProduct.ton,
				kg: totalProduct.kg - resultProduct.kg,
			},
			average: {
				kg: {
					m2: average.kg.m2 / average.coun,
					km2: average.kg.km2 / average.coun,
					rai: average.kg.rai / average.coun,
					hexa: average.kg.hexa / average.coun,
				},
				ton: {
					m2: average.ton.m2 / average.coun,
					km2: average.ton.km2 / average.coun,
					rai: average.ton.rai / average.coun,
					hexa: average.ton.hexa / average.coun,
				},
			},
		}
	}
}
