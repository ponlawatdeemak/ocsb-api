declare namespace NodeJS {
	interface ProcessEnv {
		BASE_PATH: string
		PORT: string
		APP_FE_URL: string
		APP_BE_URL: string
		RESET_PASSWORD_TIMEOUT: string
		PROXY_TILE_URL: string

		JWT_SECRET: string
		JWT_SECRET_REFRESH: string

		DATABASE_HOST: string
		DATABASE_NAME: string
		DATABASE_USER: string
		DATABASE_PASSWORD: string
		DATABASE_PORT: string
		DATABASE_DEFAULT_PORT: string

		DATABASE_SSH_HOST: string
		DATABASE_SSH_USER: string
		DATABASE_SSH_PASSWORD: string
		DATABASE_SSH_PORT: string

		MAIL_HOST: string
		MAIL_PORT: string
		MAIL_USER: string
		MAIL_PASS: string
	}
}
