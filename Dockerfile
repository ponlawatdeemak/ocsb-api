# Stage1: Build App
FROM node:22-alpine AS builder

ENV HOME_DIR=/app
WORKDIR ${HOME_DIR}
COPY ./src ${HOME_DIR}/src
COPY ./views ${HOME_DIR}/views
COPY package-lock.json ${HOME_DIR}/
COPY package.json ${HOME_DIR}/
COPY .gitmodules ${HOME_DIR}/
COPY tsconfig.json ${HOME_DIR}/
COPY ./.git ${HOME_DIR}/.git

RUN apk update && \
    apk add git && \
    git submodule update --init
    
WORKDIR ${HOME_DIR}/sugar-cane-interface 
RUN npm ci --ignore-scripts
WORKDIR ${HOME_DIR}
RUN npm ci --ignore-scripts && \	
	npm run build


# Stage2: Build Image
FROM node:22-alpine AS runner

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

ENV NODE_ENV=production HOME=/app
	
WORKDIR ${HOME}

COPY  --chown=root:node --chmod=755 --from=builder  /app/package.json ./
COPY  --chown=root:node --chmod=755 --from=builder  /app/package-lock.json ./
COPY  --chown=root:node --chmod=755 --from=builder   /app/dist/ ./dist/

RUN npm ci --ignore-scripts --omit=dev && \
	rm -rf package-lock.json

USER appuser

EXPOSE 3001

CMD ["npm", "run", "start:prod"]

