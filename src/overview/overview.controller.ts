import { ResponseDto } from '@interface/config/app.config'
import { GetLookupDtoIn } from '@interface/dto/lookup/lookup.dto-in'
import { GetLookupDtoOut } from '@interface/dto/lookup/lookup.dto-out'
import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { snakeCase } from 'change-case'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository, Between } from 'typeorm'
import {
	GetBurntOverviewDtoIn,
	GetHeatPointsOverviewDtoIn,
	GetHeatPointsSugarcaneOverviewDtoIn,
	GetPlantOverviewDtoIn,
	GetSummaryOverviewDtoIn,
} from '@interface/dto/overview/overview.dto-in'
import {
	GetBurntOverviewDtoOut,
	GetHeatPointsOverviewDtoOut,
	GetHeatPointsSugarcaneOverviewDtoOut,
	GetPlantOverviewDtoOut,
	GetSummaryOverviewDtoOut,
} from '@interface/dto/overview/overview.dto-out'
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

		return new ResponseDto<GetSummaryOverviewDtoOut>({ data })
	}

	@Get('heat-points')
	@UseGuards(AuthGuard)
	async getHeatPoints(
		@Query() payload: GetHeatPointsOverviewDtoIn,
	): Promise<ResponseDto<GetHeatPointsOverviewDtoOut[]>> {
		// year condition row
		const yearLookupCondition = await this.yearProductionEntity.findOne({ where: { id: Number(payload.id) } })

		const queryResult = await this.dataSource.query(
			`with filtered_data as (
					select * from sugarcane.sugarcane.sugarcane_hotspot
					where acq_date between $1 and $2
				),count_filtered_hotspot as(
					select count(*) from filtered_data
				)
				select 
					region_id,
					count(*) region_count,
					round((count(*)*100.0)/(select * from count_filtered_hotspot),2) region_hotspot
				from filtered_data group by region_id order by region_id 
			`,
			[yearLookupCondition.hotspotStart, yearLookupCondition.hotspotEnd],
		)

		// transform data
		const data = queryResult.map((e) => {
			return {
				regionId: e.region_id,
				regionCount: Number(e.region_count),
				regionHotspot: Number(e.region_hotspot),
			}
		})

		return new ResponseDto<GetHeatPointsOverviewDtoOut[]>({ data })
	}

	@Get('heat-points-sugarcane')
	@UseGuards(AuthGuard)
	async getHeatPointsSugarcane(
		@Query() payload: GetHeatPointsSugarcaneOverviewDtoIn,
	): Promise<ResponseDto<GetHeatPointsSugarcaneOverviewDtoOut[]>> {
		// year condition row
		const yearLookupCondition = await this.yearProductionEntity.findOne({ where: { id: Number(payload.id) } })

		const queryResult = await this.dataSource.query(
			`SELECT 
					sh.region_id, -- Dto Out : regionId
					COUNT(*) AS region_count, -- Dto Out : regionCount
					COUNT(CASE WHEN sh.in_sugarcane = true THEN 1 END) AS in_sugarcane, -- Dto Out : inSugarcan
					COUNT(CASE WHEN sh.in_sugarcane = false THEN 1 END) AS not_in_sugarcane -- Dto Out : notInSugarcan
				FROM sugarcane.sugarcane.sugarcane_hotspot sh -- Talbe sugarcane_hotspot
				where sh.acq_date -- Where ด้วย Date ที่เป็น Lookup จาก Table year_production
					BETWEEN $1 and $2
				GROUP BY sh.region_id -- GROUP ด้วยภูมิภาค
				ORDER BY sh.region_id; -- ORDER ด้วยภูมิภาค 
			`,
			[yearLookupCondition.hotspotStart, yearLookupCondition.hotspotEnd],
		)

		// transform data
		const data = queryResult.map((e) => {
			return {
				regionId: e.region_id,
				regionCount: Number(e.region_count),
				inSugarcane: Number(e.in_sugarcane),
				notInSugarcane: Number(e.not_in_sugarcane),
				// regionHotspot: Number(e.region_hotspot),
			}
		})

		return new ResponseDto<GetHeatPointsSugarcaneOverviewDtoOut[]>({ data })
	}

	@Get('burnt')
	@UseGuards(AuthGuard)
	async getBurnt(@Query() payload: GetBurntOverviewDtoIn): Promise<ResponseDto<GetBurntOverviewDtoOut[]>> {
		const queryResult = await this.dataSource.query(
			`WITH month_series AS (
				-- สร้างช่วงเดือนทั้งหมดในช่วง burn_area_start - burn_area_end
				SELECT generate_series(
					(SELECT DATE_TRUNC('month', yp.burn_area_start) FROM sugarcane.sugarcane.year_production yp WHERE yp.id = $1), -- id จาก query param
					(SELECT DATE_TRUNC('month', yp.burn_area_end) FROM sugarcane.sugarcane.year_production yp WHERE yp.id = $1), -- id จาก query param
					'1 month'
				)::date AS month
			),
			region_series AS (
				-- ดึง region_id ทั้งหมดจาก Talbe lookup 
				SELECT region_id 
				FROM sugarcane.sugarcane.regions  -- Table regions
			)
			SELECT 
				TO_CHAR(ms.month, 'YYYY-MM') AS month,  -- Dto Out : month
				rs.region_id, -- Dto Out : regionId
				SUM(sdba.area_m2) AS m2, -- Dto Out : m2
				SUM(sdba.area_km2) AS km2, -- Dto Out : km2
				SUM(sdba.area_rai) AS rai, -- Dto Out : rai
				SUM(sdba.area_hexa) AS hexa -- Dto Out : hexa
			FROM month_series ms -- สร้าง Table Temp เพื่อจำทำช่วงเดือนทั้งหมดของ Period
			CROSS JOIN region_series rs  -- นำ Lookup region มา join เพื่อให้ทุก region_id มีทุกเดือน 
			LEFT JOIN sugarcane.sugarcane.sugarcane_ds_burn_area sdba -- Join ที่ Table sugarcane_ds_burn_area
				ON DATE_TRUNC('month', sdba.detected_d) = ms.month -- ON ด้วย detected_d ที่แปลงเป็น DATE_TRUNC ให้ตรงกับ month_series ที่ทำมา
				AND sdba.region_id = rs.region_id  -- และ region_id ของ sugarcane_ds_burn_area = region_series
			GROUP BY ms.month, rs.region_id -- Group ด้วย month_series และ region_series
			ORDER BY ms.month, rs.region_id; -- Group ด้วย ORDER และ ORDER
			`,
			[payload.id],
		)

		// transform data
		const data = queryResult.map((e) => {
			return {
				month: e.month,
				regionId: e.region_id,
				m2: Number(e.m2),
				km2: Number(e.km2),
				rai: Number(e.rai),
				hexa: Number(e.hexa),
			}
		})

		return new ResponseDto<GetBurntOverviewDtoOut[]>({ data })
	}

	@Get('plant')
	@UseGuards(AuthGuard)
	async getPlant(@Query() payload: GetPlantOverviewDtoIn): Promise<ResponseDto<GetPlantOverviewDtoOut>> {
		// year condition row
		const yearLookupCondition = await this.yearProductionEntity.findOne({ where: { id: Number(payload.id) } })

		const queryResult = await this.dataSource.query(
			`WITH total_area AS ( -- Table Temp ไว้หาค่าพื้นที่ทั้งหมดของแต่ละหน่วย
					SELECT 
						SUM(sdyp2.area_m2) AS m2, -- พื้นที่ทั้งหมดหน่วยตารางเมตร
						SUM(sdyp2.area_rai) AS rai, -- พื้นที่ทั้งหมดหน่วยไร่
						SUM(sdyp2.area_km2) AS km2, -- พื้นที่ทั้งหมดหน่วยตารางกิโลเมตร
						SUM(sdyp2.area_hexa) AS hexa  -- พื้นที่ทั้งหมดหน่วย Hexa
					FROM sugarcane.sugarcane.sugarcane_ds_yield_pred sdyp2 -- Table sugarcane_ds_yield_pred
					JOIN sugarcane.sugarcane.year_production yp -- Join กับ Table lookup เพื่อเอา Data ปีและรอบ
						ON yp.id = sdyp2.id -- id จาก query param
					WHERE sdyp2.cls_round = yp.sugarcane_round -- Where ด้วยรอบและปีตาม Lookup
					AND DATE(sdyp2.cls_edate) BETWEEN TO_TIMESTAMP(yp.sugarcane_year || '-01-01', 'YYYY-MM-DD')
					AND TO_TIMESTAMP(yp.sugarcane_year || '-12-31', 'YYYY-MM-DD')
				)
				SELECT 
					r.region_id, -- Dto Out : regionId
					ARRAY_AGG(DISTINCT p.province_name ORDER BY p.province_name) AS provinces, -- Dto Out : provinces
					COALESCE(SUM(sdyp.area_m2), 0) AS m2, -- Dto Out : m2
					COALESCE(SUM(sdyp.area_rai), 0) AS rai, -- Dto Out : rai
					COALESCE(SUM(sdyp.area_km2), 0) AS km2, -- Dto Out : km2
					COALESCE(SUM(sdyp.area_hexa), 0) AS hexa, -- Dto Out : hexa
					ROUND(COALESCE(SUM(sdyp.area_m2), 0) / ta.m2 * 100, 2) AS m2_percent, -- Dto Out : m2Percent
					ROUND(COALESCE(SUM(sdyp.area_rai), 0) / ta.rai * 100, 2) AS rai_percent, -- Dto Out : raiPercent
					ROUND(COALESCE(SUM(sdyp.area_km2), 0) / ta.km2 * 100, 2) AS km2_percent, -- Dto Out : km2Percent
					ROUND(COALESCE(SUM(sdyp.area_hexa), 0) / ta.hexa * 100, 2) AS hexa_percent -- Dto Out : hexaPercent
				FROM sugarcane.sugarcane.regions r -- เริ่มจาก Regions เพื่อนำไปหา พื้นที่ของแต่ละภูมิภาคที่มี
				LEFT JOIN sugarcane.sugarcane.sugarcane_ds_yield_pred sdyp -- ไป join กับ Table ที่มีข้อมูลพื้นที่ด้วย region_id
					ON sdyp.region_id = r.region_id
					AND sdyp.cls_round = $1
					AND DATE(sdyp.cls_edate) BETWEEN (
						SELECT TO_TIMESTAMP(yp.sugarcane_year || '-01-01', 'YYYY-MM-DD') 
						FROM sugarcane.sugarcane.year_production yp 
						WHERE yp.id = $2 -- id จาก query param
					) AND (
						SELECT TO_TIMESTAMP(yp.sugarcane_year || '-12-31', 'YYYY-MM-DD') 
						FROM sugarcane.sugarcane.year_production yp 
						WHERE yp.id = $2 -- id จาก query param
					)
				LEFT JOIN sugarcane.sugarcane.provinces p -- join กับ Table ที่มีข้อมูลของจังหวัดแต่ละภาค
					ON p.region_id = r.region_id
				LEFT JOIN total_area ta ON true  -- join กับ total_area เพื่อนำคำนวณพื้นที่ทั้งหมดด้านบนมาใช้
				GROUP BY r.region_id, ta.rai, ta.m2, ta.km2, ta.hexa
				ORDER BY r.region_id;
			`,
			[yearLookupCondition.sugarcaneRound, yearLookupCondition.id],
		)

		// transform result

		const totalArea = queryResult.reduce(
			(acc, obj) => {
				acc.m2 += Number(obj.m2) || 0
				acc.km2 += Number(obj.km2) || 0
				acc.rai += Number(obj.rai) || 0
				acc.hexa += Number(obj.hexa) || 0
				return acc
			},
			{ m2: 0, km2: 0, rai: 0, hexa: 0 },
		)

		const regionArea = queryResult.map((e) => {
			return {
				regionId: e.region_id,
				provinces: e.provinces,
				m2: Number(e.m2),
				km2: Number(e.km2),
				rai: Number(e.rai),
				hexa: Number(e.hexa),

				m2Percent: Number(e.m2_percent),
				km2Percent: Number(e.km2_percent),
				raiPercent: Number(e.rai_percent),
				hexaPercent: Number(e.hexa_percent),
			}
		})

		return new ResponseDto<GetPlantOverviewDtoOut>({ data: { totalArea, regionArea } })
	}
}
