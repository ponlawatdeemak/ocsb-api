import { ResponseDto } from '@interface/config/app.config'
import { GetLookupDtoIn, GetSearchAdmLookupDtoIn } from '@interface/dto/lookup/lookup.dto-in'
import { GetLookupDtoOut, GetSearchAdmLookupDtoOut } from '@interface/dto/lookup/lookup.dto-out'
import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { snakeCase } from 'change-case'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { AuthGuard } from 'src/core/auth.guard'
@Controller('lookup')
export class LookupController {
	constructor(
		@InjectDataSource()
		private readonly dataSource: DataSource,
	) {}
	@Get()
	async get(@Query() payload: GetLookupDtoIn): Promise<ResponseDto<GetLookupDtoOut[]>> {
		const tableName = `${snakeCase(payload.name)}`
		const repository = this.dataSource.getRepository(tableName)

		const result = await repository
			.createQueryBuilder()
			.where(payload.where || {})
			.select('*')
			.orderBy(payload.sort, payload.order)
			.execute()

		return new ResponseDto({ data: result })
	}

	@Get('search-adm')
	@UseGuards(AuthGuard)
	async getSearchAdm(@Query() payload: GetSearchAdmLookupDtoIn): Promise<ResponseDto<GetSearchAdmLookupDtoOut[]>> {
		const keyword = payload.keyword || ''
		const queryBuilderAdm = await this.dataSource
			.query(
				`
				WITH province_matches AS (
					SELECT 
						ba.o_adm1c, 
						ba.o_adm1t, 
						ba.o_adm1e,
						NULL::bigint AS o_adm2c,   -- เปลี่ยนเป็น NULL::bigint
						NULL::text AS o_adm2t, 
						NULL::text AS o_adm2e, 
						NULL::bigint AS o_adm3c,   -- เปลี่ยนเป็น NULL::bigint
						NULL::text AS o_adm3t, 
						1 AS level
					FROM 
						sugarcane.sugarcane.boundary_adm1 ba
					WHERE 
						ba.o_adm1t ILIKE '%' || $1 || '%' 
						OR ba.o_adm1e ILIKE '%' || $1 || '%'
					LIMIT 10
				),
				district_matches AS (
					SELECT 
						ba2.o_adm1c, 
						ba.o_adm1t, 
						ba.o_adm1e,
						ba2.o_adm2c,
						ba2.o_adm2t, 
						ba2.o_adm2e, 
						NULL::bigint AS o_adm3c,   -- เปลี่ยนเป็น NULL::bigint
						NULL::text AS o_adm3t, 
						2 AS level
					FROM 
						sugarcane.sugarcane.boundary_adm2 ba2
					JOIN 
						sugarcane.sugarcane.boundary_adm1 ba 
						ON ba2.o_adm1c = ba.o_adm1c
					WHERE 
						ba.o_adm1t ILIKE '%' || $1 || '%' 
						OR ba.o_adm1e ILIKE '%' || $1 || '%' 
						OR ba2.o_adm2t ILIKE '%' || $1 || '%' 
						OR ba2.o_adm2e ILIKE '%' || $1 || '%'
					LIMIT 10
				),
				subdistrict_matches AS (
					SELECT 
						ba3.o_adm1c, 
						ba.o_adm1t, 
						ba.o_adm1e,
						ba2.o_adm2c,
						ba2.o_adm2t, 
						ba2.o_adm2e, 
						ba3.o_adm3c,
						ba3.o_adm3t, 
						3 AS level
					FROM 
						sugarcane.sugarcane.boundary_adm3 ba3
					JOIN 
						sugarcane.sugarcane.boundary_adm2 ba2 
						ON ba3.o_adm2c = ba2.o_adm2c
					JOIN 
						sugarcane.sugarcane.boundary_adm1 ba 
						ON ba2.o_adm1c = ba.o_adm1c
					WHERE 
						ba.o_adm1t ILIKE '%' || $1 || '%' 
						OR ba.o_adm1e ILIKE '%' || $1 || '%' 
						OR ba2.o_adm2t ILIKE '%' || $1 || '%' 
						OR ba2.o_adm2e ILIKE '%' || $1 || '%'
						OR ba3.o_adm3t ILIKE '%' || $1 || '%'
					LIMIT 10
				)
				SELECT * 
				FROM (
					SELECT * FROM province_matches
					UNION ALL
					SELECT * FROM district_matches
					UNION ALL
					SELECT * FROM subdistrict_matches
				) combined_results
				ORDER BY 
					level, 
					o_adm1t, 
					o_adm2t NULLS FIRST, 
					o_adm3t NULLS FIRST
				LIMIT 10;
			`,
				[keyword],
			)
			.then((data) => {
				return data.map((item) => {
					return {
						id: item.o_adm3c ? item.o_adm3c : item.o_adm2c ? item.o_adm2c : item.o_adm1c,
						name: {
							en: `${item.o_adm1e} ${item.o_adm2e ? item.o_adm2e : ''} ${item.o_adm3e ? item.o_adm3e : ''}`.trim(),
							th: `${item.o_adm1t} ${item.o_adm2t ? item.o_adm2t : ''} ${item.o_adm3t ? item.o_adm3t : ''}`.trim(),
						},
					}
				})
			})

		return new ResponseDto({ data: queryBuilderAdm })
	}
}
