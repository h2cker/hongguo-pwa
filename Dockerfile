FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY ShortDramaCat /usr/local/bin/ShortDramaCat
RUN chmod +x /usr/local/bin/ShortDramaCat
ENV HOME=/data
EXPOSE 9587
ENTRYPOINT ["/usr/local/bin/ShortDramaCat", "-f", "--bind", "0.0.0.0", "--port", "9587"]
