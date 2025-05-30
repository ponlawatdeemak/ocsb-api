import { hotspotType, hotspotTypeCode } from '@interface/config/app.config'
import { GetDashBoardBurntAreaDtoIn } from '@interface/dto/burnt-area/burnt-area.dto-in'
import { SugarcaneDsBurnAreaDailyEntity, SugarcaneDsYieldPredEntity, SugarcaneHotspotEntity } from '@interface/entities'
import { Injectable } from '@nestjs/common'
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm'
import { generateMonthsFromRange, getRound, getStartAndEndOfMonth, validatePayload } from 'src/core/utils'
import { Repository, Brackets, DataSource } from 'typeorm'

@Injectable()
export class BurntAreaService {
	constructor(
		@InjectRepository(SugarcaneHotspotEntity)
		private readonly sugarcaneHotspotEntity: Repository<SugarcaneHotspotEntity>,

		@InjectRepository(SugarcaneDsBurnAreaDailyEntity)
		private readonly sugarcaneDsBurnAreaEntity: Repository<SugarcaneDsBurnAreaDailyEntity>,

		@InjectRepository(SugarcaneDsYieldPredEntity)
		private readonly sugarcaneDsYieldPredEntity: Repository<SugarcaneDsYieldPredEntity>,

		@InjectDataSource()
		private readonly dataSource: DataSource,
	) {}

	async hotspotService(payload: GetDashBoardBurntAreaDtoIn) {
		let hotspot = []
		const inSugarcaneFilter = payload?.inSugarcan ? validatePayload(payload?.inSugarcan) : []
		if (inSugarcaneFilter.length !== 0) {
			let countHotspot = []

			// TODO: Check Date
			const queryBuilderHotspotCount = this.sugarcaneHotspotEntity
				.createQueryBuilder('sh')
				.where('sh.region_id IS NOT NULL')

			if (payload.startDate && payload.endDate) {
				queryBuilderHotspotCount.andWhere(
					`DATE(sh.acq_date + INTERVAL '7 hour') BETWEEN :startDate AND :endDate`,
					{
						startDate: payload.startDate,
						endDate: payload.endDate,
					},
				)
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

			// TODO: check datetime
			const queryBuilderHotspot = this.sugarcaneHotspotEntity
				.createQueryBuilder('sh')
				.select(
					`
                    sh.id,
                    sh.in_sugarcane, 
					DATE(sh.acq_date + INTERVAL '7 hour') as acq_date
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
				queryBuilderHotspot.andWhere(`DATE(sh.acq_date + INTERVAL '7 hour') BETWEEN :startDate AND :endDate`, {
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
				const monthData = hotspot.filter((e) => {
					const { startDate, endDate } = getStartAndEndOfMonth(item)
					const dateRaw = new Date(e.acq_date)
					const isInMonth = dateRaw >= startDate && dateRaw <= endDate
					return isInMonth
				})

				const dateMonth = new Date(item)
				const daysInMonth = new Date(dateMonth.getFullYear(), dateMonth.getMonth() + 1, 0).getDate()
				let monthInSugarcane = 0
				let monthNotInSugarcane = 0
				const daily = {
					inSugarcane: new Array(daysInMonth).fill(0),
					notInSugarcane: new Array(daysInMonth).fill(0),
				}
				monthData.forEach((temp) => {
					const dateIndex = new Date(temp.acq_date).getDate() - 1
					if (temp.in_sugarcane) {
						monthInSugarcane++
						daily.inSugarcane[dateIndex]++
					} else {
						monthNotInSugarcane++
						daily.notInSugarcane[dateIndex]++
					}
				})
				return {
					date: item,
					inSugarcane: monthInSugarcane,
					notInSugarcane: monthNotInSugarcane,
					daily,
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
		let adm1c = null
		let adm2c = null
		let adm3c = null
		if (payload.admC) {
			const length = payload.admC.toString().length
			if (length === 2) {
				adm1c = payload.admC
			} else if (length === 4) {
				adm2c = payload.admC
			} else if (length === 6) {
				adm3c = payload.admC
			}
		}
		const startDate = payload.startDate
		const endDate = payload.endDate

		const queryResult = await this.dataSource.query(
			`
				SELECT * 
				FROM sugarcane.get_burn_area_summary(
					p_o_adm1c := $1,
					p_o_adm2c := $2,
					p_o_adm3c := $3,
					p_start_date := $4,
					p_end_date := $5
				);
			`,
			[adm1c, adm2c, adm3c, startDate, endDate],
		)

		const list = queryResult.map((item) => {
			return {
				date: `${item.year}-${item.month < 10 ? `0${item.month}` : item.month}-01`,
				area: {
					m2: item.total_union_area_m2,
					km2: item.total_union_area_km2,
					rai: item.total_union_area_rai,
					hexa: item.total_union_area_hexa,
				},
			}
		})

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
