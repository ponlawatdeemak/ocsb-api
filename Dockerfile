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
 
COPY --chown=root:node --chmod=755 --from=builder package-lock.json ./

RUN npm ci --ignore-scripts --omit=dev && \

    rm -rf package-lock.json .npmrc .npm

# ADD --chown="21001:21001" assets ./assets
COPY --chown=root:node --chmod=755 --from=builder dist ./dist

CMD ["npm", "run", "start:prod"]

