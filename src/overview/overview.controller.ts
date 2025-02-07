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
	GetProductOverviewDtoIn,
	GetProductPredictOverviewDtoIn,
	GetSummaryOverviewDtoIn,
} from '@interface/dto/overview/overview.dto-in'
import {
	GetBurntOverviewDtoOut,
	GetHeatPointsOverviewDtoOut,
	GetHeatPointsSugarcaneOverviewDtoOut,
	GetPlantOverviewDtoOut,
	GetProductOverviewDtoOut,
	GetProductPredictOverviewDtoOut,
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

	@Get('product')
	@UseGuards(AuthGuard)
	async getProduct(@Query() payload: GetProductOverviewDtoIn): Promise<ResponseDto<GetProductOverviewDtoOut[]>> {
		const queryResult = await this.dataSource.query(
			`select r.region_id, -- Dto Out : regionId
				ARRAY_AGG(DISTINCT p.province_name ORDER BY p.province_name) AS provinces, -- Dto Out : provinces
				-- ตั้งชื่อ Dto Out ประมาณนี้เพื่อให้ FE เอา Config ต่อกันเป็น string ได้
				SUM(sdyp.yield_mean_kg_m2) as yield_mean_kg_m2, -- Dto Out : kg_m2
				SUM(sdyp.yield_mean_kg_km2) as yield_mean_kg_km2, -- Dto Out : kg_km2
				SUM(sdyp.yield_mean_kg_rai) as yield_mean_kg_rai, -- Dto Out : kg_rai
				SUM(sdyp.yield_mean_kg_hexa) as yield_mean_kg_hexa, -- Dto Out : kg_hexa
				SUM(sdyp.yield_mean_ton_m2) as yield_mean_ton_m2, -- Dto Out : ton_m2
				SUM(sdyp.yield_mean_ton_km2) as yield_mean_ton_km2, -- Dto Out : ton_km2
				SUM(sdyp.yield_mean_ton_rai) as yield_mean_ton_rai, -- Dto Out : ton_rai
				SUM(sdyp.yield_mean_ton_hexa) as yield_mean_ton_hexa -- Dto Out : ton_hexa
				FROM sugarcane.sugarcane.regions r -- เริ่มจาก Table region เพื่อให้ตั้งต้นตามภูมิภาค
				LEFT JOIN sugarcane.sugarcane.sugarcane_ds_yield_pred sdyp -- join กับ Table ที่มีข้อมูลพื้นที่ด้วย region_id
					ON sdyp.region_id = r.region_id
					AND sdyp.cls_round = ( -- เพิ่มเงื่อนไขเอาเฉพาะ Data ที่อยู่ใน Period โดยอ้างอิงจาก Lookup Table 
						SELECT yp.sugarcane_round 
						FROM sugarcane.sugarcane.year_production yp 
						WHERE yp.id = $1 -- id จาก query param
					)
					AND DATE(sdyp.cls_edate) BETWEEN (
						SELECT TO_TIMESTAMP(yp.sugarcane_year || '-01-01', 'YYYY-MM-DD') 
						FROM sugarcane.sugarcane.year_production yp 
						WHERE yp.id = $1 -- id จาก query param
					) AND (
						SELECT TO_TIMESTAMP(yp.sugarcane_year || '-12-31', 'YYYY-MM-DD') 
						FROM sugarcane.sugarcane.year_production yp 
						WHERE yp.id = $1 -- id จาก query param
					)
				LEFT JOIN sugarcane.sugarcane.provinces p -- join กับ Table ที่มีข้อมูลของจังหวัดแต่ละภาค
					ON p.region_id = r.region_id
				group by r.region_id 
				order by r.region_id ; 
			`,
			[payload.id],
		)

		// transform data
		const data = queryResult.map((e) => {
			return {
				regionId: e.region_id,
				provinces: e.provinces,
				kg_m2: Number(e.yield_mean_kg_m2),
				kg_km2: Number(e.yield_mean_kg_km2),
				kg_rai: Number(e.yield_mean_kg_rai),
				kg_hexa: Number(e.yield_mean_kg_hexa),

				ton_m2: Number(e.yield_mean_ton_m2),
				ton_km2: Number(e.yield_mean_ton_km2),
				ton_rai: Number(e.yield_mean_ton_rai),
				ton_hexa: Number(e.yield_mean_ton_hexa),
			}
		})

		return new ResponseDto<GetProductOverviewDtoOut[]>({ data })
	}

	@Get('product-predict')
	@UseGuards(AuthGuard)
	async getProductPredict(
		@Query() payload: GetProductPredictOverviewDtoIn,
	): Promise<ResponseDto<GetProductPredictOverviewDtoOut[]>> {
		const queryResult = await this.dataSource.query(
			`WITH last_4_years AS ( -- สร้าง Table Temp สำหรับ Get ปีย้อนหลัง 4 ปี
				SELECT * 
				FROM sugarcane.sugarcane.year_production
				WHERE id <= $1 -- id จาก query param
				ORDER BY id DESC
				LIMIT 4 -- ย้อนหลัง 4 
			)
			SELECT 
				yp.id as year_id, -- id ของ ปี
				yp.name as year_name, -- ชื่อของปีภาษาไทย
				yp.name_en as year_name_en, -- ชื่อของปีภาษาอังกฤษ
				r.region_id, -- id ภูมิภาค
				r.region_name, -- ชื่อของภูมิภาษาไทย
				r.region_name_en, -- ชื่อของภูมิภาษาอังกฤษ
				COALESCE(SUM(sdyp.production_kg), 0) as production_kg, -- ผลรวมของอ้อยหน่วยเป็นกิโลกรัม รวมกันตาม ปีและภายในภูมิภาคนั้นๆ 
				COALESCE(SUM(sdyp.production_ton), 0) as production_ton -- ผลรวมของอ้อยหน่วยเป็นตัน รวมกันตาม ปีและภายในภูมิภาคนั้นๆ 
			FROM last_4_years yp -- Table temp 
			CROSS JOIN sugarcane.sugarcane.regions r -- join กับ ภูมิภาคเพื่อเอาภาคทั้งหมด
			LEFT JOIN sugarcane.sugarcane.sugarcane_ds_yield_pred sdyp -- ่join กับ table ที่มี data ของอ้อย
				ON sdyp.region_id = r.region_id -- เงื่อนไขคือ ภูมิภาคเดียวกัน รอบเดียวกัน ช่วงปีเท่ากัน
				AND sdyp.cls_round = yp.sugarcane_round 
				AND DATE(sdyp.cls_edate) 
					BETWEEN TO_TIMESTAMP(yp.sugarcane_year || '-01-01', 'YYYY-MM-DD') 
					AND TO_TIMESTAMP(yp.sugarcane_year || '-12-31', 'YYYY-MM-DD') 
			GROUP BY yp.id, yp.name, r.region_id, yp.name_en, sdyp.cls_edate
			ORDER BY yp.id ASC, r.region_id; 
			`,
			[payload.id],
		)

		// transform data
		let data = []
		for (const item of queryResult) {
			let g = data.find((e) => e.yearId === item.year_id)
			if (!g) {
				// create group
				g = { yearId: item.year_id, yearName: item.year_name, yearNameEn: item.year_name_en }
				g.regions = []
				data.push(g)
			}

			// create region
			const region = {
				regionId: item.region_id,
				regionName: item.region_name,
				regionNameEn: item.region_name_en,
				kg: Number(item.production_kg),
				ton: Number(item.production_ton),
			}

			g.regions.push(region)
		}

		return new ResponseDto<GetProductPredictOverviewDtoOut[]>({ data })
	}

	@Get('replant')
	@UseGuards(AuthGuard)
	async getReplant(
		@Query() payload: GetProductPredictOverviewDtoIn,
	): Promise<ResponseDto<GetProductPredictOverviewDtoOut[]>> {
		const queryResult = await this.dataSource.query(
			`WITH last_3_years AS ( -- สร้าง Table Temp สำหรับ Get ปีย้อนหลัง 3 ปี
				SELECT * 
				FROM sugarcane.sugarcane.year_production
				WHERE id <= $1 -- id จาก query param
				ORDER BY id DESC
				LIMIT 3 -- ย้อนหลัง 3 
			), 
			repeat_area AS ( -- สร้าง Table Temp สำหรับ Get ข้อมูลการปลูกอ้อยซ้ำของแต่ละภูมิภาค
				SELECT 
					region_id,
					cls_round,
					cls_edate,
					SUM(area_m2) as area_m2,
					SUM(area_km2) as area_km2,
					SUM(area_rai) as area_rai,
					SUM(area_hexa) as area_hexa
				FROM sugarcane.sugarcane.sugarcane_ds_repeat_area 
				WHERE repeat = 3 -- การปลูกซ้ำ = 3
				GROUP BY region_id, cls_round, cls_edate
			)
			SELECT 
				yp.id AS year_id, -- id ของปี
				yp.name AS year_name, -- ชื่อของปีภาษาไทย
				yp.name_en AS year_name_en, -- ชื่อของปีภาษาอังกฤษ
				r.region_id, -- id ของภูมิภาค
				r.region_name, -- ชื่อของภูมิภาคภาษาไทย
				r.region_name_en, -- ชื่อของภูมิภาคภาษาอังกฤษ
				COALESCE(100 * ra.area_m2 / NULLIF(SUM(sdra.area_m2), 0), 0) AS m2, -- คำนวนเปอเซ็นของตารางเมตร
				COALESCE(100 * ra.area_km2 / NULLIF(SUM(sdra.area_km2), 0), 0) AS km2, -- คำนวนเปอเซ็นของตารางกิโลเมตร
				COALESCE(100 * ra.area_rai / NULLIF(SUM(sdra.area_rai), 0), 0) AS rai, -- คำนวนเปอเซ็นของไร่
				COALESCE(100 * ra.area_hexa / NULLIF(SUM(sdra.area_hexa), 0), 0) AS hexa -- คำนวนเปอเซ็นของ Hexa
			FROM last_3_years yp -- Table temp
			CROSS JOIN sugarcane.sugarcane.regions r  -- join กับ ภูมิภาคเพื่อเอาภาคทั้งหมด
			LEFT JOIN sugarcane.sugarcane.sugarcane_ds_repeat_area sdra -- ่join กับ table ที่มี data ของพื้นที่
				ON sdra.region_id = r.region_id  -- เงื่อนไขคือ ภูมิภาคเดียวกัน รอบเดียวกัน ช่วงปีเท่ากัน
				AND sdra.cls_round = yp.sugarcane_round 
				AND sdra.cls_edate BETWEEN 
					TO_TIMESTAMP(yp.sugarcane_year || '-01-01', 'YYYY-MM-DD') 
					AND TO_TIMESTAMP(yp.sugarcane_year || '-12-31', 'YYYY-MM-DD')
			LEFT JOIN repeat_area ra  -- ่join กับ table temp ที่มี data ของพื้นที่การปลูกซ้ำ
				ON ra.region_id = r.region_id -- เงื่อนไขคือ ภูมิภาคเดียวกัน รอบเดียวกัน ช่วงปีเท่ากัน
				AND ra.cls_round = yp.sugarcane_round 
				AND ra.cls_edate BETWEEN 
					TO_TIMESTAMP(yp.sugarcane_year || '-01-01', 'YYYY-MM-DD') 
					AND TO_TIMESTAMP(yp.sugarcane_year || '-12-31', 'YYYY-MM-DD')
			GROUP BY yp.id, yp.name, yp.name_en, r.region_id, ra.area_m2, ra.area_km2 ,ra.area_rai,ra.area_hexa
			ORDER BY yp.id ASC, r.region_id; 
			`,
			[payload.id],
		)

		// transform data
		let data = []
		for (const item of queryResult) {
			let g = data.find((e) => e.regionId === item.region_id)
			if (!g) {
				// create group
				g = {
					regionId: item.region_id,
					regionName: item.region_name,
					regionNameEn: item.region_name_en,
				}
				g.years = []
				data.push(g)
			}

			// create region
			const year = {
				yearId: item.year_id,
				yearName: item.year_name,
				yearNameEn: item.year_name_en,
				m2: Number(item.m2),
				km2: Number(item.km2),
				rai: Number(item.rai),
				hexa: Number(item.hexa),
			}

			g.years.push(year)
		}

		return new ResponseDto<GetProductPredictOverviewDtoOut[]>({ data })
	}
}
