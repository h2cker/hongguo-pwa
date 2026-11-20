FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /src
COPY com ./com
RUN mkdir -p /out && javac -d /out com/veyra/gybeyond/HongguoV5.java com/veyra/gybeyond/V5Signer.java

FROM eclipse-temurin:21-jre-alpine
RUN apk add --no-cache nodejs ffmpeg
WORKDIR /app
COPY --from=builder /out ./classes
COPY v5-proxy.js ./
EXPOSE 9589
CMD sh -c "java -Xmx128m -cp /app/classes com.veyra.gybeyond.V5Signer & exec node /app/v5-proxy.js"
