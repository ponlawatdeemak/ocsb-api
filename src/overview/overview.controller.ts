import { ResponseDto } from '@interface/config/app.config'
import { GetLookupDtoIn } from '@interface/dto/lookup/lookup.dto-in'
import { GetLookupDtoOut } from '@interface/dto/lookup/lookup.dto-out'
import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { snakeCase } from 'change-case'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository, Between } from 'typeorm'
import { GetSummaryOverviewDtoIn } from '@interface/dto/overview/overview.dto-in'
import { GetSummaryOverviewDtoOut } from '@interface/dto/overview/overview.dto-out'
import { YearProductionEntity } from '@interface/entities'
import { SugarcaneHotspotEntity } from '@interface/entities/sugarcane-hotspot.entity'
import { AuthGuard } from 'src/core/auth.guard'
@Controller('overview')
export class OverviewController {
	constructor(
		@InjectDataSource()
		private readonly dataSource: DataSource,

		@InjectRepository(YearProductionEntity)
		private readonly yearProductionEntity: Repository<YearProductionEntity>,

		@InjectRepository(SugarcaneHotspotEntity)
		private readonly sugarcaneHotspotEntity: Repository<SugarcaneHotspotEntity>,
	) {}

	@Get('summary')
	@UseGuards(AuthGuard)
	async getSummary(@Query() payload: GetSummaryOverviewDtoIn): Promise<ResponseDto<GetSummaryOverviewDtoOut>> {
		// year condition row
		const yearLookupCondition = await this.yearProductionEntity.findOne({ where: { id: Number(payload.id) } })

		// ### 1. hotspot
		const cntHotspot = await this.sugarcaneHotspotEntity.count({
			where: {
				acqDate: Between(new Date(yearLookupCondition.hotspotStart), new Date(yearLookupCondition.hotspotEnd)),
			},
		})

		// ### 2. พื้นที่ร่องรอยเผาไหม้
		const burnAreaQuery = await this.dataSource.query(
			`select COALESCE(SUM(sdba.area_m2),0) as m2,
				COALESCE(SUM(sdba.area_km2),0) as km2, 
				COALESCE(SUM(sdba.area_rai),0) as rai,
				COALESCE(SUM(sdba.area_hexa),0) as hexa 
			from sugarcane.sugarcane.sugarcane_ds_burn_area sdba 
			where DATE(sdba.detected_d) BETWEEN $1 and $2
			`,
			[new Date(yearLookupCondition.burnAreaStart), new Date(yearLookupCondition.burnAreaEnd)],
		)

		// convert string from query result to number type.
		Object.keys(burnAreaQuery[0]).forEach((key) => {
			burnAreaQuery[0][key] = Number(burnAreaQuery[0][key])
		})

		// ### 3. พื้นที่ปลูกอ้อย/ปริมาณอ้อย
		const yieldPredQuery = await this.dataSource.query(
			`select SUM(sdyp.area_m2) as m2, 
				SUM(sdyp.area_km2) as km2, 
				SUM(sdyp.area_rai) as rai, 
				SUM(sdyp.area_hexa) as hexa, 
				SUM(sdyp.production_kg) as kg, 
				SUM(sdyp.production_ton) as ton
			from sugarcane.sugarcane.sugarcane_ds_yield_pred sdyp 
			where sdyp.cls_round = $1 and EXTRACT(YEAR FROM sdyp.cls_edate) = $2
			`,
			[yearLookupCondition.sugarcaneRound, yearLookupCondition.sugarcaneYear],
		)

		// convert string from query result to number type.
		Object.keys(yieldPredQuery[0]).forEach((key) => {
			yieldPredQuery[0][key] = Number(yieldPredQuery[0][key])
		})

		// format result
		const data: GetSummaryOverviewDtoOut = {
			hotspot: cntHotspot,
			burnArea: burnAreaQuery[0],
			sugarcaneVolume: { ton: yieldPredQuery[0].ton, kg: yieldPredQuery[0].kg },
			yieldPred: {
				m2: yieldPredQuery[0].m2,
				km2: yieldPredQuery[0].km2,
				rai: yieldPredQuery[0].rai,
				hexa: yieldPredQuery[0].hexa,
			},
		}

		return new ResponseDto({ data })
	}
}
