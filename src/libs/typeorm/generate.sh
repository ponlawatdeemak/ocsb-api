MY_PATH="$(dirname -- "${0}")"
OUT_PATH=$1
echo $MY_PATH
echo $OUT_PATH
source .env && \
typeorm-model-generator \
    --host $DATABASE_HOST \
    --database $DATABASE_NAME \
    --user $DATABASE_USER \
    --pass $DATABASE_PASSWORD \
    --port $DATABASE_PORT \
    --schema sugarcane \
    --engine postgres \
    --output $OUT_PATH \
    --strictMode="?" \
    --case-file="none" \
    --noConfig \
    --index \
    --generateConstructor \
    --namingStrategy=$MY_PATH/naming
#    --disablePluralization \
#    --table="req_building_permit"
