FROM node:22-alpine

ARG P_USER_NAME=app
ARG P_UID=21001
ENV NODE_ENV=production HOME=/app
RUN apk add --no-cache curl


# Create a new user to our new container and avoid the root userx
RUN addgroup --gid ${P_UID} ${P_USER_NAME} && \

    adduser --disabled-password --uid ${P_UID} ${P_USER_NAME} -G ${P_USER_NAME} && \
    mkdir -p ${HOME} && \
    chown -R ${P_UID}:${P_UID} ${HOME}

WORKDIR ${HOME}
USER ${P_UID}

ADD --chown="21001:21001" package*.json ./

RUN npm ci --omit=dev && \

    rm -rf package-lock.json .npmrc .npm

# ADD --chown="21001:21001" assets ./assets
ADD --chown="21001:21001" dist ./dist

CMD npm run start:prod

