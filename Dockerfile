FROM node:10-alpine
LABEL "project.home"="https://github.com/dtube/avalon"
COPY ./ /avalon
WORKDIR /avalon
RUN npm install
EXPOSE 6001
EXPOSE 3001
ENV DB_URL 'mongodb://localhost:27017'
ENV DB_NAME 'avalon'
ENV NODE_OWNER 'default user'
ENV NODE_OWNER_PUB 'Invalid Key'
ENV NODE_OWNER_PRIV 'Invalid Key'
ENV PEERS 'ws://35.236.17.85:6001,ws://35.203.37.221:6001,ws://35.247.202.198:6001,ws://35.200.45.42:6001,ws://35.200.45.42:6001,ws://34.65.181.103:6001'
CMD ["node","--stack-size=65500","src/main"]
