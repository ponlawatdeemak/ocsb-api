import { hotspotType, hotspotTypeCode } from '@interface/config/app.config'
import { GetDashBoardBurntAreaDtoIn } from '@interface/dto/brunt-area/brunt-area.dto-in'
import { SugarcaneDsBurnAreaDailyEntity, SugarcaneDsYieldPredEntity, SugarcaneHotspotEntity } from '@interface/entities'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
	generateMonthsFromRange,
	getBurntMonthYearList,
	getRound,
	getStartAndEndOfMonth,
	sumby,
	validatePayload,
} from 'src/core/utils'
import { Repository, Brackets } from 'typeorm'

@Injectable()
export class BurntAreaService {
	constructor(
		@InjectRepository(SugarcaneHotspotEntity)
		private readonly sugarcaneHotspotEntity: Repository<SugarcaneHotspotEntity>,

		@InjectRepository(SugarcaneDsBurnAreaDailyEntity)
		private readonly sugarcaneDsBurnAreaEntity: Repository<SugarcaneDsBurnAreaDailyEntity>,

		@InjectRepository(SugarcaneDsYieldPredEntity)
		private readonly sugarcaneDsYieldPredEntity: Repository<SugarcaneDsYieldPredEntity>,
	) {}

	async hotspotService(payload: GetDashBoardBurntAreaDtoIn) {
		let hotspot = []
		const inSugarcaneFilter = payload?.inSugarcan ? validatePayload(payload?.inSugarcan) : []
		if (inSugarcaneFilter.length !== 0) {
			let countHotspot = []
			const queryBuilderHotspotCount = this.sugarcaneHotspotEntity
				.createQueryBuilder('sh')
				.where('sh.region_id IS NOT NULL')

			if (payload.startDate && payload.endDate) {
				queryBuilderHotspotCount.andWhere('DATE(sh.acq_date) BETWEEN :startDate AND :endDate', {
					startDate: payload.startDate,
					endDate: payload.endDate,
				})
			}

			queryBuilderHotspotCount.andWhere(
				new Brackets((qb) => {
					if (payload.admC) {
						qb.orWhere(`sh.o_adm3c = :admC`, { admC: payload.admC })
						qb.orWhere(`sh.o_adm2c = :admC`, { admC: payload.admC })
						qb.orWhere(`sh.o_adm1c = :admC`, { admC: payload.admC })
					}
				}),
			)
			countHotspot = await queryBuilderHotspotCount.getRawMany()

			const queryBuilderHotspot = this.sugarcaneHotspotEntity
				.createQueryBuilder('sh')
				.select(
					`
                    sh.id,
                    sh.in_sugarcane,
                    sh.acq_date
                     `,
				)
				.where('sh.region_id IS NOT NULL')
				.andWhere(
					new Brackets((qb) => {
						if (inSugarcaneFilter.length !== hotspotType.length) {
							if (inSugarcaneFilter.includes(hotspotTypeCode.inSugarcan)) {
								qb.where('sh.in_sugarcane = true')
							} else if (inSugarcaneFilter.includes(hotspotTypeCode.notInSugarcane)) {
								qb.where('sh.in_sugarcane = false')
							}
						}
					}),
				)

			if (payload.startDate && payload.endDate) {
				queryBuilderHotspot.andWhere('DATE(sh.acq_date) BETWEEN :startDate AND :endDate', {
					startDate: payload.startDate,
					endDate: payload.endDate,
				})
			}

			queryBuilderHotspot.andWhere(
				new Brackets((qb) => {
					if (payload.admC) {
						qb.orWhere(`sh.o_adm3c = :admC`, { admC: payload.admC })
						qb.orWhere(`sh.o_adm2c = :admC`, { admC: payload.admC })
						qb.orWhere(`sh.o_adm1c = :admC`, { admC: payload.admC })
					}
				}),
			)

			hotspot = await queryBuilderHotspot.getRawMany()

			const today = new Date().toISOString().split('T')[0]
			const month = generateMonthsFromRange(payload.startDate || today, payload.endDate || today)
			const calcHotSpot = month.map((item) => {
				const findData = hotspot.filter((e) => {
					const { startDate, endDate } = getStartAndEndOfMonth(item)
					const dateRaw = new Date(e.acq_date)
					return dateRaw >= startDate && dateRaw <= endDate
				})
				return {
					date: item,
					inSugarcane: findData.filter((item) => item.in_sugarcane === true).length,
					notInSugarcane: findData.filter((item) => item.in_sugarcane === false).length,
				}
			})

			return {
				total: countHotspot.length,
				inSugarcane: countHotspot.filter((item) => item.sh_in_sugarcane === true).length,
				notInSugarcane: countHotspot.filter((item) => item.sh_in_sugarcane === false).length,
				list: calcHotSpot,
			}
		}
	}

	async burnAreaService(payload: GetDashBoardBurntAreaDtoIn) {
		const queryBuilderBurnArea = this.sugarcaneDsBurnAreaEntity
			.createQueryBuilder('sdba')
			.select(
				`
                    sdba.id,
                    sdba.detected_d,
                    sdba.area_m2,
                    sdba.area_km2,
                    sdba.area_rai,
                    sdba.area_hexa
                    `,
			)
			.where('sdba.region_id IS NOT NULL')
			.andWhere(
				new Brackets((qb) => {
					if (payload.admC) {
						qb.orWhere(`sdba.o_adm3c = :admC`, { admC: payload.admC })
						qb.orWhere(`sdba.o_adm2c = :admC`, { admC: payload.admC })
						qb.orWhere(`sdba.o_adm1c = :admC`, { admC: payload.admC })
					}
				}),
			)
			.orderBy('detected_d')

		// const payloadMonth = []
		if (payload.startDate && payload.endDate) {
			queryBuilderBurnArea.andWhere('DATE(sdba.detected_d) BETWEEN :startDate AND :endDate', {
				startDate: payload.startDate,
				endDate: payload.endDate,
			})
		}

		const burnArea = await queryBuilderBurnArea.getRawMany()
		const allowedMonths = [10, 11, 12, 1, 2, 3, 4, 5] // พื้นที่เผาไหม้มีข้อมูลแค่เดือน ตุลาคม - พฤษภาคม
		const burntMonth = getBurntMonthYearList(payload.startDate, payload.endDate, allowedMonths)
		const calcBurnArea = burntMonth.map((itemMonth) => {
			const filterData = burnArea.filter((item) => {
				const dateData = new Date(item.detected_d)
				const monthData = dateData.getMonth() + 1
				const dateMonth = new Date(itemMonth)
				const monthTemp = dateMonth.getMonth() + 1
				return monthData === monthTemp
			})

			return {
				date: itemMonth,
				area: {
					m2: sumby(filterData, 'area_m2'),
					km2: sumby(filterData, 'area_km2'),
					rai: sumby(filterData, 'area_rai'),
					hexa: sumby(filterData, 'area_hexa'),
				},
			}
		})
		const tempStart = []
		const tempEnd = []
		// if (calcBurnArea.length < allowedMonths.length) {
		// 	const startDate = new Date(calcBurnArea[0].date)
		// 	const startMonth = startDate.getMonth() + 1
		// 	const startYear = startMonth >= 10 ? startDate.getFullYear() - 1 : startDate.getFullYear()
		// 	const endDate = new Date(calcBurnArea[calcBurnArea.length - 1].date)
		// 	const endMonth = endDate.getMonth() + 1
		// 	const endYear = endDate.getFullYear()
		// 	const startIdx = allowedMonths.findIndex((item) => item === startMonth)
		// 	const endIdx = allowedMonths.findIndex((item) => item === endMonth)

		// 	allowedMonths.forEach((month, idx) => {
		// 		if (idx < startIdx) {
		// 			tempStart.push({
		// 				date: `${startYear}-${month}-01`,
		// 				area: { m2: 0, km2: 0, rai: 0, hexa: 0 },
		// 			})
		// 		}
		// 		if (idx > endIdx) {
		// 			tempEnd.push({
		// 				date: `${endYear}-${month}-01`,
		// 				area: { m2: 0, km2: 0, rai: 0, hexa: 0 },
		// 			})
		// 		}
		// 	})
		// }
		const list = [...tempStart, ...calcBurnArea, ...tempEnd]

		return { list }
	}

	async yieldPredService(payload: GetDashBoardBurntAreaDtoIn) {
		const queryBuilderYieldTotal = this.sugarcaneDsYieldPredEntity
			.createQueryBuilder('syp')
			.select(
				`
                SUM(syp.area_m2) as area_m2,
                SUM(syp.area_km2) as area_km2,
                SUM(syp.area_rai) as area_rai,
                SUM(syp.area_hexa) as area_hexa
                `,
			)
			.where('syp.regionId IS NOT NULL')

		// if (payload.startDate && payload.endDate) {
		// 	queryBuilderYieldTotal.andWhere('DATE(syp.clsEdate) BETWEEN :startDate AND :endDate', {
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
			queryBuilderYieldTotal.andWhere({ clsRound: round.round })
			queryBuilderYieldTotal.andWhere('syp.cls_sdate >= :startDate AND syp.cls_edate <= :endDate', {
				startDate: round.sDate,
				endDate: round.eDate,
			})
		}

		const totalYieldPred = await queryBuilderYieldTotal.getRawOne()

		const queryBuilderYieldPred = this.sugarcaneDsYieldPredEntity
			.createQueryBuilder('syp')
			.select(
				`
                    SUM(syp.area_m2) as area_m2,
                    SUM(syp.area_km2) as area_km2,
                    SUM(syp.area_rai) as area_rai,
                    SUM(syp.area_hexa) as area_hexa
                    `,
			)
			.where('syp.region_id IS NOT NULL')
			.andWhere(
				new Brackets((qb) => {
					if (payload.admC) {
						qb.orWhere(`syp.o_adm3c = :admC`, { admC: payload.admC })
						qb.orWhere(`syp.o_adm2c = :admC`, { admC: payload.admC })
						qb.orWhere(`syp.o_adm1c = :admC`, { admC: payload.admC })
					}
				}),
			)
		// if (payload.startDate && payload.endDate) {
		// 	queryBuilderYieldPred.andWhere('DATE(syp.cls_edate) BETWEEN :startDate AND :endDate', {
		// 		startDate: payload.startDate,
		// 		endDate: payload.endDate,
		// 	})
		// }
		if (payload.endDate) {
			const dataSplit = payload.endDate.split('-')
			const month = Number(dataSplit[1])
			const year = Number(dataSplit[0])
			const round = getRound(month, year)
			queryBuilderYieldPred.andWhere({ clsRound: round.round })
			queryBuilderYieldPred.andWhere('syp.cls_sdate >= :startDate AND syp.cls_edate <= :endDate', {
				startDate: round.sDate,
				endDate: round.eDate,
			})
		}

		const yieldPred = await queryBuilderYieldPred.getRawOne()
		return {
			total: {
				m2: parseFloat(totalYieldPred.area_m2),
				km2: parseFloat(totalYieldPred.area_km2),
				rai: parseFloat(totalYieldPred.area_rai),
				hexa: parseFloat(totalYieldPred.area_hexa),
			},
			area: {
				m2: parseFloat(yieldPred.area_m2 || 0),
				km2: parseFloat(yieldPred.area_km2 || 0),
				rai: parseFloat(yieldPred.area_rai || 0),
				hexa: parseFloat(yieldPred.area_hexa || 0),
			},
		}
	}
}
