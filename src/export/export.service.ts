import { Injectable } from '@nestjs/common'
import * as ExcelJS from 'exceljs'
import * as yazl from 'yazl'
import { PassThrough } from 'stream'
import {
	SugarcaneDsBurnAreaEntity,
	SugarcaneDsRepeatAreaEntity,
	SugarcaneDsYieldPredEntity,
	SugarcaneHotspotEntity,
} from '@interface/entities'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ExportHotspotBurntAreaDtoIn, ExportYieldAreaDtoIn } from '@interface/dto/export/export.dto-in'
import { convertPolygonToWKT, getRound, validatePayload } from 'src/core/utils'
import { hotspotTypeCode } from '@interface/config/app.config'
import { columnsBurnArea, columnsHotspot, columnsRepeatArea, columnsYieldArea } from '@interface/config/report.config'

@Injectable()
export class ExportService {
	constructor(
		@InjectRepository(SugarcaneHotspotEntity)
		private readonly sugarcaneHotspotEntity: Repository<SugarcaneHotspotEntity>,

		@InjectRepository(SugarcaneDsBurnAreaEntity)
		private readonly sugarcaneDsBurnAreaEntity: Repository<SugarcaneDsBurnAreaEntity>,

		@InjectRepository(SugarcaneDsYieldPredEntity)
		private readonly sugarcaneDsYieldPredEntity: Repository<SugarcaneDsYieldPredEntity>,

		@InjectRepository(SugarcaneDsRepeatAreaEntity)
		private readonly sugarcaneDsRepeatAreaEntity: Repository<SugarcaneDsRepeatAreaEntity>,
	) {}

	async generateCsv(columns: string[], rows: any[][]): Promise<Buffer> {
		const workbook = new ExcelJS.Workbook()
		const worksheet = workbook.addWorksheet('Data')
		worksheet.addRow(columns)
		rows.forEach((row) => worksheet.addRow(row))
		const csvBuffer: any = await workbook.csv.writeBuffer()
		const utf8Buffer = Buffer.concat([Buffer.from('\uFEFF', 'utf8'), csvBuffer])
		return utf8Buffer
	}

	async generateZip(Arraybuffer): Promise<Buffer> {
		const zip = new yazl.ZipFile()
		for (let index = 0; index < Arraybuffer.length; index++) {
			const element = Arraybuffer[index]
			zip.addBuffer(element.data, `${element.fileName}.csv`)
		}
		const zipStream = new PassThrough()
		zip.outputStream.pipe(zipStream)
		zip.end()
		return zipStream as any
	}

	validateColumns(word, builder, area, weight) {
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
			.map((word) => this.validateColumns(word, builder, area, weight))
			.join(', ')
	}

	async bufferHotspotService(payload: ExportHotspotBurntAreaDtoIn) {
		const inSugarcaneFilter = payload?.inSugarcan ? validatePayload(payload?.inSugarcan) : []
		if (inSugarcaneFilter.length !== 0) {
			const queryBuilderHotspot = this.sugarcaneHotspotEntity
				.createQueryBuilder('sh')
				.select(
					`jsonb_agg(jsonb_build_array(${this.convertArrayToString(columnsHotspot, 'sh', payload.area, payload.weight)})) AS data`,
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
			const hotspot = await queryBuilderHotspot.getRawOne().then((item) => {
				return item.data || []
			})

			const reCheckColumns = await this.validateColumnsInCSV(columnsHotspot, payload.area, payload.weight)
			const bufferHotspot = await this.generateCsv(reCheckColumns, hotspot)
			return bufferHotspot
		}
	}

	async bufferBurnAreaService(payload: ExportHotspotBurntAreaDtoIn) {
		const queryBuilderBurnArea = await this.sugarcaneDsBurnAreaEntity
			.createQueryBuilder('sdba')
			.select(
				`jsonb_agg(jsonb_build_array(${this.convertArrayToString(columnsBurnArea, 'sdba', payload.area, payload.weight)})) AS data`,
			)
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
		const burnArea = await queryBuilderBurnArea.getRawOne().then((item) => {
			return item.data || []
		})
		const reCheckColumns = await this.validateColumnsInCSV(columnsBurnArea, payload.area, payload.weight)
		const bufferBurnArea = await this.generateCsv(reCheckColumns, burnArea)
		return bufferBurnArea
	}

	async bufferYieldAreaService(payload: ExportHotspotBurntAreaDtoIn | ExportYieldAreaDtoIn) {
		const queryBuilderYieldPred = await this.sugarcaneDsYieldPredEntity
			.createQueryBuilder('sdyp')
			.select(
				`jsonb_agg(jsonb_build_array(${this.convertArrayToString(columnsYieldArea, 'sdyp', payload.area, payload.weight)})) AS data`,
			)
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
		const yieldArea = await queryBuilderYieldPred.getRawOne().then((item) => {
			return item.data || []
		})
		const reCheckColumns = await this.validateColumnsInCSV(columnsYieldArea, payload.area, payload.weight)
		const bufferYieldArea = await this.generateCsv(reCheckColumns, yieldArea)
		return bufferYieldArea
	}

	async bufferRepeatAreaService(payload: ExportYieldAreaDtoIn) {
		const queryBuilderRePlant = await this.sugarcaneDsRepeatAreaEntity
			.createQueryBuilder('sdra')
			.select(
				`jsonb_agg(jsonb_build_array(${this.convertArrayToString(columnsRepeatArea, 'sdra', payload.area, payload.weight)})) AS data`,
			)
			.where('sdra.region_id IS NOT NULL')
		if (payload.repeat) {
			queryBuilderRePlant.andWhere('sdra.repeat = :repeat', {
				repeat: payload.repeat,
			})
		}

		if (payload.startDate && payload.endDate) {
			queryBuilderRePlant.andWhere('sdra.cls_edate BETWEEN :startDate AND :endDate', {
				startDate: payload.startDate,
				endDate: payload.endDate,
			})
		}
		if (payload.admC) {
			queryBuilderRePlant.andWhere('(sdra.o_adm1c = :admc or sdra.o_adm2c = :admc or sdra.o_adm3c = :admc)', {
				admc: payload.admC,
			})
		} else {
			if (payload.polygon) {
				const formatePolygon = convertPolygonToWKT(JSON.parse(payload.polygon))
				queryBuilderRePlant.andWhere('ST_Within(sdra.geometry, ST_GeomFromText(:polygon, 4326))', {
					polygon: formatePolygon,
				})
			}
		}

		const repeatArea = await queryBuilderRePlant.getRawOne().then((item) => {
			return item.data || []
		})
		const reCheckColumns = await this.validateColumnsInCSV(columnsRepeatArea, payload.area, payload.weight)
		const bufferRepeatArea = await this.generateCsv(reCheckColumns, repeatArea)
		return bufferRepeatArea
	}
}
