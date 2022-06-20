FROM node:16-alpine3.14 as base
ARG APP
ARG NPM_REGISTRY
ENV BASE_DIR=/app \
  APP=${APP:-blockscanner} \
  NPM_REGISTRY=${NPM_REGISTRY:-https://registry.npmjs.org}

# Create app directory
WORKDIR $BASE_DIR

FROM base AS dependencies
COPY ./package*.json $BASE_DIR/
RUN npm install --only=prod --registry=${NPM_REGISTRY}

# install all dependencies and build
FROM base AS build

COPY ./package*.json $BASE_DIR/
RUN npm install --registry=${NPM_REGISTRY}
RUN npm i @nestjs/cli --registry=${NPM_REGISTRY}

COPY . $BASE_DIR/

RUN node_modules/.bin/nest build $APP

FROM base AS release

# Create app directory
WORKDIR $BASE_DIR

COPY --from=dependencies $BASE_DIR/node_modules/ $BASE_DIR/node_modules/
COPY --from=build $BASE_DIR/dist/ $BASE_DIR/dist/

EXPOSE 8080

ENTRYPOINT ["node"]

CMD ["dist/apps/$APP/main.js"]
