# Elasticsearch Type Ahead Demo

Project demo cho Elasticsearch với giao diện tìm kiếm `type ahead`, dữ liệu mẫu, script seed random, và benchmark so sánh với lọc mảng JavaScript.

## Yêu cầu

- Docker Desktop
- Node.js 18+
- PowerShell

## Cấu trúc nhanh

- `docker-compose.yml`: chạy Elasticsearch local
- `data/products.ndjson`: dữ liệu mẫu, có sẵn 10 sản phẩm
- `scripts/seed.js`: sinh thêm 50,000 sản phẩm random và nạp vào Elasticsearch
- `scripts/benchmark.js`: benchmark JS array filter vs Elasticsearch query
- `public/test-elasticsearch.html`: trang test cluster và search thủ công
- `public/typeahead.html`: trang search realtime có debounce
- `docs/report.md`: báo cáo kỹ thuật của nhóm

## Cách chạy

### 1. Khởi động Elasticsearch

```powershell
docker compose up -d
```

Kiểm tra nhanh:

```powershell
curl.exe http://localhost:9200
```

Nếu thấy `cluster_name` và thông tin node thì Elasticsearch đã chạy.

### 2. Cài dependency Node

```powershell
npm install
```

### 3. Nạp dữ liệu

Bạn có 2 cách nạp dữ liệu vào index `products`.

#### Cách A: Nạp file mẫu `products.ndjson`

File này đã đúng format Bulk API của Elasticsearch.

```powershell
curl.exe -X POST "http://localhost:9200/products/_bulk" `
  -H "Content-Type: application/x-ndjson" `
  --data-binary "@data/products.ndjson"
```

Sau đó refresh index:

```powershell
curl.exe -X POST "http://localhost:9200/products/_refresh"
```

#### Cách B: Sinh dữ liệu random bằng `seed.js`

Script này sẽ tạo 50,000 record và nạp vào Elasticsearch theo batch 5,000 record.

```powershell
node scripts/seed.js
```

Lưu ý: `scripts/seed.js` đang giả định 10 record đầu đã có từ `products.ndjson`, nên script này sẽ bắt đầu từ ID `11`.

### 4. Mở giao diện

Mở các file HTML bằng Live Server hoặc một static server tương tự, không mở trực tiếp bằng `file://`:

- `public/test-elasticsearch.html`: ping cluster, test query, xem JSON response
- `public/typeahead.html`: tìm kiếm realtime theo `name`, `tags`, `category`

## Cách dùng UI

### `public/test-elasticsearch.html`

- Nhập endpoint mặc định: `http://localhost:9200`
- Bấm `Ping cluster` để kiểm tra kết nối
- Bấm `Search products` để test query `products/_search`

### `public/typeahead.html`

- Nhập endpoint: `http://localhost:9200`
- Gợi ý sẽ hiện sau khi bạn gõ được một vài ký tự
- UI có debounce 180ms và hủy request cũ bằng `AbortController`

## Benchmark

Chạy:

```powershell
node scripts/benchmark.js
```

Script này:

- tự sinh 50,000 product trong RAM
- benchmark lọc bằng `Array.filter()`
- benchmark truy vấn Elasticsearch tại `http://localhost:9200/products/_search`

Lưu ý: benchmark này không dùng chung dữ liệu với `scripts/seed.js`. Phần JS benchmark tự sinh dữ liệu riêng trong bộ nhớ, còn phần Elasticsearch chỉ có ý nghĩa khi index `products` đã có dữ liệu.

## Troubleshooting

### Search không ra kết quả

- Kiểm tra Elasticsearch đã chạy chưa: `curl.exe http://localhost:9200`
- Kiểm tra index có dữ liệu chưa:

```powershell
curl.exe http://localhost:9200/products/_count
```

- Nếu `count = 0`, hãy nạp lại `data/products.ndjson` hoặc chạy `node scripts/seed.js`

### Lỗi trùng tên container `es-demo`

Nếu Docker báo conflict vì container cũ đã tồn tại:

```powershell
docker rm -f es-demo
docker compose up -d
```

### UI không gọi được Elasticsearch

- Đảm bảo `docker-compose.yml` đã bật CORS
- Mở trang bằng Live Server hoặc static server, không mở trực tiếp file HTML bằng `file://`

## Thứ tự để demo nhanh

1. `docker compose up -d`
2. `npm install`
3. `curl.exe -X POST "http://localhost:9200/products/_bulk" -H "Content-Type: application/x-ndjson" --data-binary "@data/products.ndjson"`
4. `curl.exe -X POST "http://localhost:9200/products/_refresh"`
5. Mở `public/typeahead.html`
6. Thử tìm `ca phe`, `tea`, `cake`
