package com.veyra.gybeyond;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.zip.*;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public class V5Signer {
    static final String HOST = "https://api5-normal-sinfonlinea.fqnovel.com";
    static final String PLAYER_MODEL = HOST + "/novel/player/multi_video_model/player/v1";
    static final String[] VIDEO_TAB_URLS = {
        "https://api5-normal-sinfonlineb.fqnovel.com/reading/bookapi/video_tab/multi_video_model/v1/",
        "https://api5-normal-sinfonlinea.fqnovel.com/reading/bookapi/video_tab/multi_video_model/v1/",
        "https://reading.snssdk.com/reading/bookapi/video_tab/multi_video_model/v1/"
    };
    static final String[] DEFAULT_DEVICE = {
        "1624456208323876",
        "1624456208327972",
        "91d56f7e-c027-4ce9-9a3c-229d59a13c3b",
        ""
    };
    static final String REGISTER = "https://log5-applog-lf.fqnovel.com/service/2/device_register/?tt_data=a&cronet_version=8d40f833_2026-03-03&ttnet_version=4.2.243.31-douyin&use_store_region_cookie=1";
    static final String REGISTER_UA = "com.phoenix.read/72232 (Linux; U; Android 16; zh_CN; 25053RT47C; Build/BP2A.250605.031.A3)";
    static final String TAB_UA = "com.phoenix.read/73932 (Linux; U; Android 16; zh_CN; 25053RT47C; Build/BP2A.250605.031.A3; Cronet/TTNetVersion:04657795 2026-01-23 QuicVersion:c67e9834 2025-09-08)";
    static final String PLAYBACK_UA = "com.phoenix.read/73932 (Linux; U; Android 12; zh_CN_#Hans; PGT-AN10; Build/V417IR;tt-ok/3.12.13.20)";
    static final byte[] KDF_SALT = HongguoV5.hex("4dd4c2e6b83162090e52b3c7a6733ba41cb2462b829ab58a196b39db57177524f49baf7f08e8d68d26a72e37c1a95a2f1f05a51892aef2949732b62a38aadd58");
    static final SecureRandom RANDOM = new SecureRandom();
    static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();

    static byte[] sha512(byte[] d) throws Exception { return MessageDigest.getInstance("SHA-512").digest(d); }
    static byte[] aesCbc(byte[] data, byte[] key, byte[] iv) throws Exception {
        Cipher c = Cipher.getInstance("AES/CBC/PKCS5Padding");
        c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new IvParameterSpec(iv));
        return c.doFinal(data);
    }
    static byte[] gzip(byte[] data) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        try (GZIPOutputStream g = new GZIPOutputStream(b)) { g.write(data); }
        return b.toByteArray();
    }
    static byte[] gunzip(byte[] data) {
        try (GZIPInputStream g = new GZIPInputStream(new ByteArrayInputStream(data))) {
            return g.readAllBytes();
        } catch (Exception e) { return data; }
    }
    static byte[] concat(byte[] a, byte[] b) {
        byte[] o = new byte[a.length + b.length];
        System.arraycopy(a, 0, o, 0, a.length);
        System.arraycopy(b, 0, o, a.length, b.length);
        return o;
    }

    static String[] register() throws Exception {
        long now = System.currentTimeMillis();
        String cdid = UUID.randomUUID().toString();
        byte[] openudid = new byte[8]; RANDOM.nextBytes(openudid);
        String headerJson = "{"
            + "\"display_name\":\"红果免费短剧\",\"update_version_code\":73932,\"manifest_version_code\":73932,"
            + "\"app_version_minor\":\"7.3.9.32\",\"aid\":8662,\"channel\":\"update_64\",\"package\":\"com.phoenix.read\","
            + "\"app_version\":\"7.3.9.32\",\"version_code\":73932,\"sdk_version\":\"3.7.0-rc.34-fanqie-xiaoshuo\","
            + "\"sdk_target_version\":29,\"git_hash\":\"3a88f4e\",\"os\":\"Android\",\"os_version\":\"16\",\"os_api\":36,"
            + "\"device_model\":\"25053RT47C\",\"device_brand\":\"Redmi\",\"device_manufacturer\":\"Redmi\","
            + "\"cpu_abi\":\"arm64-v8a\",\"release_build\":\"b5e187f\",\"density_dpi\":520,\"display_density\":\"mdpi\","
            + "\"resolution\":\"1280x2772\",\"language\":\"zh\",\"timezone\":8,\"access\":\"wifi\",\"not_request_sender\":0,"
            + "\"carrier\":\"CHINA MOBILE\",\"mcc_mnc\":\"46000\",\"rom\":\"eng.root.20231116.160340\","
            + "\"rom_version\":\"W528JS release-keys\",\"cdid\":\"" + cdid + "\",\"sig_hash\":\"56a962410c494bbaf0b58dba20cae56f\","
            + "\"openudid\":\"" + HongguoV5.hexText(openudid) + "\",\"clientudid\":\"" + UUID.randomUUID() + "\",\"ipv6_list\":[],"
            + "\"region\":\"CN\",\"tz_name\":\"Asia/Shanghai\",\"tz_offset\":28800,\"sim_region\":\"cn\",\"sim_serial_number\":[],"
            + "\"oaid_may_support\":false,\"req_id\":\"" + UUID.randomUUID() + "\",\"device_platform\":\"android\","
            + "\"custom\":{\"account_region_src\":\"fallback\",\"account_region\":\"cn\",\"host_bit\":64,\"dragon_device_type\":\"phone\"},"
            + "\"pre_installed_channel\":\"\",\"apk_first_install_time\":" + now + ",\"is_system_app\":0,\"sdk_flavor\":\"china\",\"guest_mode\":0"
            + "}";
        String payload = "{\"magic_tag\":\"ss_app_log\",\"header\":" + headerJson + ",\"_gen_time\":" + now + "}";
        byte[] compressed = gzip(payload.getBytes(StandardCharsets.UTF_8));
        byte[] random = new byte[32]; RANDOM.nextBytes(random);
        byte[] derived = sha512(concat(sha512(random), KDF_SALT));
        byte[] key = Arrays.copyOfRange(derived, 0, 16);
        byte[] iv = Arrays.copyOfRange(derived, 16, 32);
        byte[] plain = concat(sha512(compressed), compressed);
        byte[] body = concat(concat(HongguoV5.hex("746305100000"), random), aesCbc(plain, key, iv));

        HttpRequest req = HttpRequest.newBuilder(URI.create(REGISTER))
            .timeout(Duration.ofSeconds(10))
            .header("User-Agent", REGISTER_UA)
            .header("Content-Type", "application/octet-stream;tt-data=a")
            .header("Accept", "application/json")
            .header("log-encode-type", "gzip")
            .header("x-ss-dp", "8662")
            .header("x-ss-req-ticket", String.valueOf(now))
            .header("x-vc-bdturing-sdk-version", "4.0.3.cn")
            .header("lc", "101")
            .header("sdk-version", "2")
            .header("passport-sdk-version", "5051452")
            .header("x-neptune", "-8|50:51:59:30:40:47:49:39")
            .header("x-ss-stub", HongguoV5.hexText(HongguoV5.md5(body)).toUpperCase())
            .POST(HttpRequest.BodyPublishers.ofByteArray(body))
            .build();
        HttpResponse<byte[]> resp = HTTP.send(req, HttpResponse.BodyHandlers.ofByteArray());
        String text = new String(gunzip(resp.body()), StandardCharsets.UTF_8);
        String devId = extractStr(text, "device_id_str");
        if (devId.isEmpty()) devId = extractNum(text, "device_id");
        String iid = extractStr(text, "install_id_str");
        if (iid.isEmpty()) iid = extractNum(text, "install_id");
        if (devId.isEmpty() || iid.isEmpty()) throw new IOException("register failed: " + text);
        String egdi = extractStr(text, "klink_egdi");
        // Best-effort device activation (app_alert_check) required by upstream
        try {
            String activateUrl = "https://log5-applog-lf.fqnovel.com/service/2/app_alert_check/?aid=8662&app_name=novelread&channel=update_64"
                + "&device_id=" + devId + "&iid=" + iid
                + "&device_platform=android&os=android&version_code=73932&version_name=7.3.9.32&_rticket=" + System.currentTimeMillis();
            HttpRequest actReq = HttpRequest.newBuilder(URI.create(activateUrl))
                .timeout(Duration.ofSeconds(3))
                .header("User-Agent", REGISTER_UA)
                .header("Accept", "application/json")
                .GET()
                .build();
            HTTP.send(actReq, HttpResponse.BodyHandlers.discarding());
        } catch (Exception ignored) {}
        return new String[]{ devId, iid, cdid, egdi };
    }

    static String extractStr(String j, String k) {
        int i = j.indexOf("\"" + k + "\":\"");
        if (i < 0) return "";
        i += k.length() + 4;
        int e = j.indexOf("\"", i);
        return e > i ? j.substring(i, e) : "";
    }
    static String extractNum(String j, String k) {
        int i = j.indexOf("\"" + k + "\":");
        if (i < 0) return "";
        i += k.length() + 3;
        int e = i;
        while (e < j.length() && Character.isDigit(j.charAt(e))) e++;
        return j.substring(i, e);
    }

    static String fetchPlayerModel(String vid, String[] dev) throws Exception {
        long now = System.currentTimeMillis();
        LinkedHashMap<String, String> values = new LinkedHashMap<>();
        values.put("aid", "8662");
        values.put("app_name", "novelread");
        values.put("version_code", "74332");
        values.put("version_name", "7.4.3.32");
        values.put("channel", "vivo_8662_64");
        values.put("device_platform", "android");
        values.put("device_type", "PGT-AN10");
        values.put("os_version", "12");
        values.put("update_version_code", "74332");
        values.put("iid", dev[1]);
        values.put("cdid", dev[2]);
        values.put("device_id", dev[0]);
        values.put("_rticket", String.valueOf(now));

        String payload = "{\"biz_param\":{\"detail_page_version\":0,\"device_level\":1,\"disable_digg_stat\":false,\"disable_video_relate_book\":false,\"need_all_video_definition\":true,\"need_mp4_align\":false,\"use_os_player\":false,\"use_server_dns\":false,\"video_platform\":1024},\"mixed_video_id_map\":{\"1004\":[\"" + vid + "\"]},\"dr_scene\":\"player\"}";
        byte[] body = gzip(payload.getBytes(StandardCharsets.UTF_8));
        HongguoV5.Signed signed = HongguoV5.signPlayback(PLAYER_MODEL, values, body, now);

        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(signed.url))
            .timeout(Duration.ofSeconds(12))
            .header("User-Agent", PLAYBACK_UA)
            .header("Accept", "application/json")
            .header("Content-Encoding", "gzip")
            .header("Content-Type", "application/json; charset=UTF-8")
            .header("Cookie", "store-region=cn-bj; store-region-src=did; install_id=" + dev[1])
            .header("x-ss-stub", HongguoV5.hexText(HongguoV5.md5(body)).toUpperCase());
        for (Map.Entry<String, String> e : signed.headers.entrySet()) {
            b.header(e.getKey(), e.getValue());
        }
        HttpResponse<byte[]> resp = HTTP.send(b.POST(HttpRequest.BodyPublishers.ofByteArray(body)).build(), HttpResponse.BodyHandlers.ofByteArray());
        if (resp.statusCode() < 200 || resp.statusCode() >= 300) {
            throw new IOException("HTTP " + resp.statusCode());
        }
        return new String(gunzip(resp.body()), StandardCharsets.UTF_8);
    }

    static String fetchVideoTabModel(String vid, String[] dev, String tabUrl) throws Exception {
        long now = System.currentTimeMillis();
        LinkedHashMap<String, String> values = new LinkedHashMap<>();
        values.put("device_platform", "android");
        values.put("os", "android");
        values.put("ssmix", "a");
        values.put("cdid", dev[2]);
        values.put("channel", "vivo_8662_64");
        values.put("aid", "8662");
        values.put("app_name", "novelread");
        values.put("version_code", "74332");
        values.put("version_name", "7.4.3.32");
        values.put("manifest_version_code", "74332");
        values.put("update_version_code", "74332");
        values.put("resolution", "1920*1080");
        values.put("dpi", "280");
        values.put("device_type", "PGT-AN10");
        values.put("device_brand", "HONOR");
        values.put("language", "zh");
        values.put("os_api", "31");
        values.put("os_version", "12");
        values.put("ac", "wifi");
        values.put("host_abi", "arm64-v8a");
        values.put("dragon_device_type", "phone");
        values.put("pv_player", "74332");
        values.put("compliance_status", "0");
        values.put("need_personal_recommend", "1");
        values.put("player_so_load", "1");
        values.put("is_android_pad_screen", "0");
        values.put("rom_version", "V417IR+release-keys");
        values.put("iid", dev[1]);
        values.put("device_id", dev[0]);
        if (dev.length > 3 && dev[3] != null && !dev[3].isEmpty()) {
            values.put("klink_egdi", dev[3]);
        }
        values.put("video_id", vid);
        values.put("video_id_type", "0");
        values.put("device_level", "1");
        values.put("need_all_video_definition", "1");
        values.put("need_mp4_align", "0");
        values.put("use_os_player", "0");
        values.put("video_platform", "1024");
        values.put("source", "0");
        values.put("from_video_id", "");

        HongguoV5.Signed signed = HongguoV5.signPlayback(tabUrl, values, new byte[0], now);
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(signed.url))
            .timeout(Duration.ofSeconds(10))
            .header("User-Agent", TAB_UA)
            .header("Accept", "application/json");
        for (Map.Entry<String, String> e : signed.headers.entrySet()) {
            b.header(e.getKey(), e.getValue());
        }
        HttpResponse<byte[]> resp = HTTP.send(b.GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        if (resp.statusCode() < 200 || resp.statusCode() >= 300) {
            throw new IOException("HTTP " + resp.statusCode());
        }
        return new String(gunzip(resp.body()), StandardCharsets.UTF_8);
    }

    static final class DeviceSlot {
        final String[] dev;
        int uses;
        final boolean isDefault;
        DeviceSlot(String[] dev, int uses, boolean isDefault) {
            this.dev = dev;
            this.uses = uses;
            this.isDefault = isDefault;
        }
    }

    static final Object LOCK = new Object();
    static volatile DeviceSlot activeSlot = new DeviceSlot(DEFAULT_DEVICE, 0, true);
    static long lastRegisterAt = 0;

    static void sleepGap(long lastAt, long minGapMs) throws InterruptedException {
        long wait = lastAt + minGapMs - System.currentTimeMillis();
        if (wait > 0) Thread.sleep(wait);
    }

    static boolean isValidModel(String text) {
        return text != null && !text.trim().isEmpty() && text.contains("video_model");
    }

    static String fetchWithSlot(String vid, DeviceSlot slot) {
        String structuredFallback = null;
        for (int i = 0; i < 2; i++) {
            try {
                String text = fetchVideoTabModel(vid, slot.dev, VIDEO_TAB_URLS[i]);
                if (isValidModel(text)) return text;
                if (structuredFallback == null && text != null && text.contains("\"code\":0")) {
                    structuredFallback = text;
                }
            } catch (Exception ignored) {}
        }
        if (structuredFallback != null) return structuredFallback;
        try {
            String text = fetchPlayerModel(vid, slot.dev);
            if (isValidModel(text)) return text;
        } catch (Exception ignored) {}
        return null;
    }

    static String fetchWithRetry(String vid) throws Exception {
        DeviceSlot slot;
        synchronized (LOCK) {
            if (activeSlot == null || (!activeSlot.isDefault && activeSlot.uses >= 20)) {
                activeSlot = new DeviceSlot(DEFAULT_DEVICE, 0, true);
            }
            slot = activeSlot;
        }

        String res = fetchWithSlot(vid, slot);
        if (isValidModel(res)) {
            if (!slot.isDefault) {
                synchronized (LOCK) {
                    slot.uses++;
                    if (activeSlot == slot && slot.uses >= 20) {
                        activeSlot = new DeviceSlot(DEFAULT_DEVICE, 0, true);
                    }
                }
            }
            return res;
        }
        if (res != null) return res;

        synchronized (LOCK) {
            if (activeSlot != slot) {
                String retryRes = fetchWithSlot(vid, activeSlot);
                if (isValidModel(retryRes)) {
                    if (!activeSlot.isDefault) {
                        activeSlot.uses++;
                        if (activeSlot.uses >= 20) activeSlot = new DeviceSlot(DEFAULT_DEVICE, 0, true);
                    }
                    return retryRes;
                }
                if (retryRes != null) return retryRes;
            }
            if (slot.isDefault) {
                sleepGap(lastRegisterAt, 2000);
                lastRegisterAt = System.currentTimeMillis();
                DeviceSlot fresh = new DeviceSlot(register(), 0, false);
                activeSlot = fresh;
                try {
                    String text = fetchVideoTabModel(vid, fresh.dev, VIDEO_TAB_URLS[0]);
                    if (isValidModel(text)) {
                        fresh.uses++;
                        return text;
                    }
                    if (text != null && text.contains("\"code\":0")) return text;
                } catch (Exception ignored) {}
                try {
                    String text = fetchVideoTabModel(vid, fresh.dev, VIDEO_TAB_URLS[2]);
                    if (isValidModel(text)) {
                        fresh.uses++;
                        return text;
                    }
                } catch (Exception ignored) {}
            } else {
                activeSlot = new DeviceSlot(DEFAULT_DEVICE, 0, true);
                try {
                    String text = fetchVideoTabModel(vid, activeSlot.dev, VIDEO_TAB_URLS[0]);
                    if (isValidModel(text)) return text;
                    if (text != null && text.contains("\"code\":0")) return text;
                } catch (Exception ignored) {}
            }
            throw new IOException("empty response after video_tab and player attempts");
        }
    }

    public static void main(String[] args) throws Exception {
        int port = Integer.parseInt(System.getenv().getOrDefault("SIGNER_PORT", "9590"));
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.createContext("/playinfo", (HttpExchange ex) -> {
            byte[] out;
            int status = 200;
            try {
                String q = ex.getRequestURI().getRawQuery();
                String vid = "";
                if (q != null) {
                    for (String p : q.split("&")) {
                        if (p.startsWith("vid=")) vid = URLDecoder.decode(p.substring(4), StandardCharsets.UTF_8);
                    }
                }
                if (!vid.matches("[0-9]{1,30}")) throw new IllegalArgumentException("invalid vid");
                out = fetchWithRetry(vid).getBytes(StandardCharsets.UTF_8);
            } catch (Exception e) {
                status = 502;
                String msg = String.valueOf(e.getMessage()).replace("\"", "'");
                out = ("{\"error\":\"" + msg + "\"}").getBytes(StandardCharsets.UTF_8);
            }
            ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            ex.sendResponseHeaders(status, out.length);
            try (OutputStream os = ex.getResponseBody()) { os.write(out); }
        });
        server.start();
        System.out.println("V5Signer listening on 127.0.0.1:" + port);
    }
}
