import { Injectable, Inject } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from '@nestjs/typeorm'
import * as entities from '@interface/entities'
@Injectable()
export class TypeOrmConfigService implements TypeOrmOptionsFactory {
	@Inject(ConfigService)
	private readonly config: ConfigService

	public createTypeOrmOptions(): TypeOrmModuleOptions {
		return {
			type: 'postgres',
			host: this.config.get<string>('DATABASE_HOST'),
			port: this.config.get<number>('DATABASE_PORT'),
			database: this.config.get<string>('DATABASE_NAME'),
			username: this.config.get<string>('DATABASE_USER'),
			password: this.config.get<string>('DATABASE_PASSWORD'),
			entities: entities ? Object.values(entities) : [],
			migrations: ['dist/migrations/*.{ts,js}'],
			migrationsTableName: 'typeorm_migrations',
			logger: 'debug',
			logging: 'all',
			autoLoadEntities: true,
		}
	}
}
