import { Injectable } from '@nestjs/common'
import * as yazl from 'yazl'
import {
	SugarcaneDsBurnAreaDailyEntity,
	SugarcaneDsRepeatAreaEntity,
	SugarcaneDsYieldPredEntity,
	SugarcaneHotspotEntity,
} from '@interface/entities'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
	ExportHotspotBurntAreaDtoIn,
	ExportHotspotRegionDtoIn,
	ExportYieldAreaDtoIn,
} from '@interface/dto/export/export.dto-in'
import { convertPolygonToWKT, getRound, validatePayload } from 'src/core/utils'
import { areaType, hotspotTypeCode, weightType } from '@interface/config/app.config'
import {
	columnsBurnArea,
	columnsHotspot,
	columnsRepeatArea,
	columnsYieldArea,
	reportName,
} from '@interface/config/report.config'
import { ReadStream } from 'fs'
import * as moment from 'moment-timezone'
import { Readable } from 'stream'
import { from, map, Observable, startWith, lastValueFrom } from 'rxjs'

@Injectable()
export class ExportService {
	constructor(
		@InjectRepository(SugarcaneHotspotEntity)
		private readonly sugarcaneHotspotEntity: Repository<SugarcaneHotspotEntity>,

		@InjectRepository(SugarcaneDsBurnAreaDailyEntity)
		private readonly sugarcaneDsBurnAreaEntity: Repository<SugarcaneDsBurnAreaDailyEntity>,

		@InjectRepository(SugarcaneDsYieldPredEntity)
		private readonly sugarcaneDsYieldPredEntity: Repository<SugarcaneDsYieldPredEntity>,

		@InjectRepository(SugarcaneDsRepeatAreaEntity)
		private readonly sugarcaneDsRepeatAreaEntity: Repository<SugarcaneDsRepeatAreaEntity>,
	) {}

	async generateCsv(columns: string[], rowStream: ReadStream, fileName: string) {
		const rx = from(rowStream).pipe(
			map(
				(data) =>
					Object.values(data)
						.map((d) => (d != null ? `"${d}"` : ''))
						.join(',') + '\n',
			),
			startWith(Buffer.from('\uFEFF', 'utf8'), Buffer.from(columns.map((col) => `"${col}"`).join(',') + '\n')),
		)
		return { stream: rx, fileName: `${fileName}.csv` }
	}

	generateZip(items: any[]): NodeJS.ReadableStream {
		const zip = new yazl.ZipFile()
		for (let index = 0; index < items.length; index++) {
			const element = items[index]
			zip.addReadStream(this.toStream(element.stream), element.fileName)
		}
		lastValueFrom(from(items)).finally(() => {
			zip.end()
		})
		return zip.outputStream
	}

	toStream(observable: Observable<any>, readable?: Readable) {
		readable =
			readable ??
			new Readable({
				// https://stackoverflow.com/q/74670330/4417769
				read() {},
				objectMode: true,
				autoDestroy: true,
			})

		observable.subscribe({
			next(value) {
				readable.push(value)
			},
			complete() {
				readable.push(null)
			},
			error(err) {
				readable.destroy(err)
			},
		})
		return readable
	}

	validateColumns(word, builder, area, weight) {
		// TODO: check acq_date
		switch (word) {
			case 'latitude':
				return `ST_Y(${builder}.geometry)`
			case 'longitude':
				return `ST_X(${builder}.geometry)`
			case 'acq_date':
			case 'cls_sdate':
			case 'cls_edate':
				return `TO_CHAR(${builder}.${word}, 'DD/MM/YYYY')`
			case 'gg_location':
				return `CONCAT('https://www.google.com/maps?q=', ST_Y(${builder}.geometry), ',', ST_X(${builder}.geometry))`
			case 'production':
				return `${builder}.${word}_${weight}`
			case 'area':
				return `${builder}.area_${area}`
			case 'geometry':
				return `ST_AsText(${builder}.geometry)`
			default:
				return `${builder}.${word}`
		}
	}

	async validateColumnsInCSV(data, area, weight) {
		const recheckWord = data.map((item) => {
			switch (item) {
				case 'production':
					return `production_${weight}`
				case 'area':
					return `area_${area === 'hexa' ? 'ha' : area}`
				default:
					return item
			}
		})
		return recheckWord
	}

	convertArrayToString(columns, builder, area, weight) {
		return columns
			.filter((word) => word.trim() !== '')
			.map((word) => `${this.validateColumns(word, builder, area, weight)} AS ${word}`)
			.join(', ')
	}

	async bufferHotspotService(payload: ExportHotspotBurntAreaDtoIn) {
		const inSugarcaneFilter = payload?.inSugarcan ? validatePayload(payload?.inSugarcan) : []
		if (inSugarcaneFilter.length !== 0) {
			// TODO: check datetime
			const queryBuilderHotspot = this.sugarcaneHotspotEntity
				.createQueryBuilder('sh')
				.select(this.convertArrayToString(columnsHotspot, 'sh', payload.area, payload.weight))
				.where('sh.region_id IS NOT NULL')
			if (inSugarcaneFilter.length === 1) {
				queryBuilderHotspot.andWhere({ inSugarcane: inSugarcaneFilter[0] === hotspotTypeCode.inSugarcan })
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
			const items = await queryBuilderHotspot.stream()
			const reCheckColumns = await this.validateColumnsInCSV(columnsHotspot, payload.area, payload.weight)
			const bufferHotspot = await this.generateCsv(reCheckColumns, items, reportName.hotspont)
			return bufferHotspot
		}
	}

	async bufferBurnAreaService(payload: ExportHotspotBurntAreaDtoIn) {
		const queryBuilderBurnArea = this.sugarcaneDsBurnAreaEntity
			.createQueryBuilder('sdba')
			.select(this.convertArrayToString(columnsBurnArea, 'sdba', payload.area, payload.weight))
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
		const items = await queryBuilderBurnArea.stream()
		const reCheckColumns = await this.validateColumnsInCSV(columnsBurnArea, payload.area, payload.weight)
		const bufferBurnArea = await this.generateCsv(reCheckColumns, items, reportName.burntArea)
		return bufferBurnArea
	}

	async bufferYieldAreaService(payload: ExportHotspotBurntAreaDtoIn | ExportYieldAreaDtoIn) {
		const queryBuilderYieldPred = this.sugarcaneDsYieldPredEntity
			.createQueryBuilder('sdyp')
			.select(this.convertArrayToString(columnsYieldArea, 'sdyp', payload.area, payload.weight))
			.where('sdyp.region_id IS NOT NULL')
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
		const items = await queryBuilderYieldPred.stream()
		const reCheckColumns = await this.validateColumnsInCSV(columnsYieldArea, payload.area, payload.weight)
		const bufferYieldArea = await this.generateCsv(reCheckColumns, items, reportName.plant)
		return bufferYieldArea
	}

	async bufferRepeatAreaService(payload: ExportYieldAreaDtoIn) {
		const queryBuilderRePlant = this.sugarcaneDsRepeatAreaEntity
			.createQueryBuilder('sdra')
			.select(this.convertArrayToString(columnsRepeatArea, 'sdra', payload.area, payload.weight))
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
		const items = await queryBuilderRePlant.stream()
		const reCheckColumns = await this.validateColumnsInCSV(columnsRepeatArea, payload.area, payload.weight)
		const bufferRepeatArea = await this.generateCsv(reCheckColumns, items, reportName.plantRepeat)
		return bufferRepeatArea
	}

	async bufferHotspotRegion(payload: ExportHotspotRegionDtoIn) {
		// TODO: check datetime
		const queryBuilderHotspot = this.sugarcaneHotspotEntity
			.createQueryBuilder('sh')
			.select(this.convertArrayToString(columnsHotspot, 'sh', areaType.km2, weightType.tom))
			.where('sh.region_id =:regionId', { regionId: payload.regionId })
		const round = Number(payload.round)
		const date = moment().utcOffset(0, true).startOf('date').toDate()
		let dateStart = moment(date)
		let dateEnd = moment(date)
		if (round === 1) {
			dateStart = moment(date).subtract(7, 'hours')
			dateEnd = moment(date).add(7, 'hours')
		} else if (round === 2) {
			dateStart = moment(date).add(7, 'hours')
			dateEnd = moment(date).add(17, 'hours')
		}

		queryBuilderHotspot.andWhere(`(sh.acq_date + INTERVAL '7 hour') > :startDate `, {
			startDate: dateStart,
		})
		queryBuilderHotspot.andWhere(`(sh.acq_date + INTERVAL '7 hour') <= :endDate`, {
			endDate: dateEnd,
		})

		const items = await queryBuilderHotspot.stream()

		const reCheckColumns = await this.validateColumnsInCSV(columnsHotspot, areaType.km2, weightType.tom)
		const path = await this.generateCsv(reCheckColumns, items, reportName.hotspont)
		return path
	}
}
