setlocal
@echo off
FOR /F "tokens=*" %%i in (%1) do SET %%i

typeorm-model-generator --host %DATABASE_HOST% --database %DATABASE_NAME% --user %DATABASE_USER% --pass %DATABASE_PASSWORD% --port %DATABASE_PORT% --schema sugarcane --engine postgres --output %2 --strictMode="?" --case-file="none" --noConfig --index --generateConstructor --namingStrategy=%~dp0%naming

endlocal