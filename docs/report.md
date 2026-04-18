**Nhóm 8**

**Thành viên:** 
* Ngô Bảo Long - 23127219
* Lý Quốc Thạnh - 23127262

---

# Báo cáo kỹ thuật: Tích hợp Elasticsearch cho tính năng Type Ahead Search

**Mục tiêu:** Xây dựng tính năng Type Ahead Search (Tự động gợi ý) hiệu suất cao, mang đến trải nghiệm tìm kiếm tức thì và chính xác cho người dùng thông qua kiến trúc Elasticsearch và các kỹ thuật tối ưu hóa phía Client.

---

## 1. Thiết lập & Chuẩn bị Dữ liệu (Setup & Data Preparation)

Hệ thống bắt đầu bằng việc triển khai kiến trúc cơ sở và chuẩn bị khối lượng dữ liệu mô phỏng để đánh giá.

* **Hạ tầng Docker:** Elasticsearch được cấu hình và chạy dưới dạng container thông qua Docker (cung cấp cổng `9200`). Việc sử dụng Docker giúp cô lập môi trường, dễ dàng mở rộng (scale) và đảm bảo tính nhất quán giữa môi trường phát triển (development) và môi trường sản xuất (production) mà không phải can thiệp sâu vào hệ điều hành gốc.
* **Trình sinh Dữ liệu mô phỏng (Mock Data Generation):** Để có tập dữ liệu thử nghiệm đáng tin cậy, kịch bản `seed.js` sử dụng thư viện **`@faker-js/faker`** tạo ra **50,000 sản phẩm (products)** ở bộ nhớ đệm (RAM). Các trường dữ liệu bao gồm `name`, `category`, `price`, `stock`, và các nhãn `tags`.
* **Import qua Bulk API:** Thay vì thực hiện 50,000 index request đơn lẻ (gây nghẽn mạng và quá tải I/O), kịch bản gom nhóm (batching) mỗi 5,000 bản ghi theo định dạng **NDJSON** (Newline Delimited JSON). Sau đó, nó sử dụng endpoint `_bulk` của Elasticsearch để nạp dữ liệu. Cơ chế Bulk API tối ưu hóa đáng kể resource mạng và cho phép khả năng lập chỉ mục số lượng lớn (mass-indexing) với tốc độ cực nhanh.

## 2. Đánh giá Hiệu năng: Quét toàn bộ bảng vs. Elasticsearch ($O(N)$ vs $O(1)$)

Dựa trên bài test Benchmark vừa được thực thi (với 50,000 bản ghi), kết quả đo lường thời gian đáp ứng thu được là:
* **Full Table Scan (Native JS Array Filter):** 16.50 ms
* **Elasticsearch (qua cổng HTTP):** 90.20 ms

**Phân tích kỹ thuật chuyên sâu:**
Thoạt nhìn, Elasticsearch có vẻ chậm hơn. Tuy nhiên, thời gian 16.50 ms của Array Filter bản chất là thao tác quét tuần tự các object đang **nằm sẵn trong RAM của một tiến trình duy nhất**. Trong khi đó, 90.20 ms của Elasticsearch phải gánh thêm độ trễ (latency) của giao thức mạng HTTP, quá trình serialize/deserialize JSON, và pipeline định tuyến của server.

Tuy nhiên, với mô hình CSDL khổng lồ (vài triệu đến hàng trăm triệu bản ghi), hiệu suất thực tế sẽ thể hiện sự khác biệt cấu trúc hoàn toàn:
* **Full Table Scan ($O(N)$):** Thuật toán tìm kiếm thông thường (ví dụ: `LIKE '%keyword%'`) bắt buộc engine phải duyệt từ đầu đến cuối danh sách. Số lượng bản ghi càng tăng, thời gian xử lý càng tăng tuyến tính, gây phung phí nghiêm trọng tài nguyên CPU/Memory.
* **Inverted Index của Elasticsearch (~$O(1)$ hoặc $O(\log N)$):** Thay vì quét từng tài liệu, Elasticsearch tách các từ khóa (tokens) và lập một mục lục ngược (Inverted Index - hoạt động tương tự mục lục cuối sách). Khi tra cứu, hệ thống đi thẳng đến "từ khóa" đó để lấy ra tập tài liệu chứa nó. Tốc độ này gần như không đổi bất kể kích thước dữ liệu, đảm bảo thời gian phản hồi ở quy mô Big Data vẫn luôn duy trì ở mức Mili-giây.

## 3. Tham số Truy vấn & Độ liên quan (Query Parameters & Relevance)

Chất lượng của một bộ máy tìm kiếm không chỉ nằm ở tốc độ, mà còn ở "độ chính xác" và "ngữ cảnh" của các kết quả hiển thị đầu tiên. Cấu hình query JSON trong module `typeahead.html` được tinh chỉnh cẩn thận để giải quyết bài toán này:

* **Truy vấn `match_phrase_prefix`:** Hỗ trợ hoàn thiện từ (Auto-completion). Ví dụ: người dùng mới nhập "co", hệ thống sẽ tự động đối chiếu tiền tố này với "coffee" hoặc "coconut". Tính năng này tối quan trọng với nghiệp vụ Type Ahead vì người dùng thường chưa nhập hết từ vựng.
* **Chiến lược Đánh trọng số (Boosting Strategy):**
    * **`name: { boost: 4 }`**: Tên sản phẩm luôn mang ngữ nghĩa chính xác nhất. Khi keyword khớp với trường tên, điểm số (`_score`) được nhân lên gấp 4 lần, đẩy kết quả này lên top đầu.
    * **`tags: { boost: 1.5 }`**: Nếu không khớp trực tiếp tên, từ khóa nằm trong nhãn dán (tag) của sản phẩm vẫn được ưu tiên thứ cấp (nhân 1.5).
    * **`category: { boost: 0.5 }`**: Trùng khớp ở cấp độ danh mục có tính liên quan rộng nhất nên chỉ nhận trọng số thấp (nhân 0.5).
* **`minimum_should_match: 1`:** Yêu cầu văn bản phải thỏa mãn ít nhất **1** trong các điều kiện thuộc khối `should` (logic OR), giúp loại bỏ nhiễu và các tài liệu không liên quan.
* **`size: 7`:** Type Ahead UI cần hiển thị nhanh gọn dưới dạng pop-up nhỏ. Giới hạn 7 kết quả nhằm giảm tải payload mạng (dung lượng chuỗi JSON trả về) và ngăn ngừa tình trạng tràn lấp giao diện trên thiết bị di động.

## 4. Tối ưu hóa UX/UI phía Client (Client-side UX/UI Optimizations)

Khâu phức tạp nhất của Type Ahead nằm ở việc kiểm soát Input Keyboard phía giao diện người dùng. Mã nguồn `typeahead.html` áp dụng các kỹ thuật Front-end nâng cao nhằm đảm bảo tính ổn định của hệ thống:

* **Cơ chế Debounce (Độ trễ `setTimeout` - 180ms):**
    * Khi người dùng gõ phím liên tục (như c - o - f - f - e - e), việc gọi API ngay lập tức cho mỗi ký tự sẽ tạo ra 6 HTTP request, dễ gây quá tải (DDoS cục bộ) cho server.
    * Bằng cách sử dụng `clearTimeout` và `setTimeout`, hệ thống buộc trình duyệt chờ 180 mili-giây. API chỉ thực sự được gọi khi người dùng ngừng gõ quá khoảng thời gian này, giúp tiết kiệm băng thông tối đa.
* **Chống Race Conditions với `AbortController`:**
    * Trong môi trường mạng không ổn định, request 1 (gõ "cof") có thể mất 500ms để hoàn thành, trong khi request 2 (gõ "coffee") chỉ mất 50ms. Hậu quả là kết quả của request 1 trả về sau, ghi đè lên kết quả của request 2, khiến người dùng gõ "coffee" nhưng lại nhìn thấy gợi ý của "cof".
    * Thông qua đối tượng `AbortController`, khi có một sự kiện gõ phím mới, lệnh `controller.abort()` sẽ **chủ động hủy bỏ toàn bộ HTTP Request đang bị treo trước đó**. Nhờ vậy, giao diện luôn render dựa trên dữ liệu mới nhất, triệt tiêu hoàn toàn lỗi Race Condition.

## 5. Hướng dẫn Cài đặt và Khởi chạy (How to Run)

Để triển khai và kiểm thử dự án trên môi trường local, vui lòng thực hiện tuần tự các bước sau:

**Bước 1: Khởi chạy Elasticsearch (Thông qua Docker)**
Đảm bảo máy tính đã cài đặt Docker Desktop. Mở Terminal và chạy lệnh sau để kéo image và khởi động container Elasticsearch (phiên bản single-node, tắt tính năng bảo mật để tiện cho việc test ở môi trường dev):
```bash
docker run -d --name elasticsearch -p 9200:9200 -p 9300:9300 -e "discovery.type=single-node" -e "xpack.security.enabled=false" docker.elastic.co/elasticsearch/elasticsearch:8.x.x
```
*(Lưu ý: Thay `8.x.x` bằng phiên bản cụ thể nếu cần. Kiểm tra trạng thái sống bằng cách truy cập `http://localhost:9200` trên trình duyệt).*

**Bước 2: Cài đặt thư viện và Sinh dữ liệu mô phỏng (Seed Data)**
Di chuyển vào thư mục chứa mã nguồn (ví dụ: `elastic-search`), cài đặt thư viện Faker và chạy kịch bản đẩy 50,000 bản ghi vào CSDL:
```bash
# 1. Khởi tạo Node.js project và cài thư viện
npm init -y
npm install @faker-js/faker

# 2. Chạy kịch bản sinh và đẩy dữ liệu
node seed.js
```
*Hệ thống sẽ log ra terminal tiến trình đẩy từng batch (5000 records/lần). Đợi đến khi báo "Seed script complete!" là hoàn tất.*

**Bước 3: Chạy kịch bản So sánh Hiệu năng (Benchmark)**
Để kiểm chứng tốc độ giữa Inverted Index và Full Table Scan, thực thi file benchmark:
```bash
node benchmark.js
```
*Kết quả thời gian thực thi của 2 phương pháp sẽ được in trực tiếp ra Terminal.*

**Bước 4: Trải nghiệm Giao diện Người dùng (UI)**
Dự án sử dụng file HTML tĩnh, không cần build qua bundler (như Webpack/Vite). 
* Có thể dùng các extension như **Live Server** (trên VSCode) hoặc mở trực tiếp file trên trình duyệt.
* **`test-elasticsearch.html`**: Dành cho nhà phát triển (Developer) dùng để ping cluster, test query thô và kiểm tra JSON response.
* **`typeahead.html`**: Giao diện End-user cuối cùng. Hãy nhập thử các từ khóa như *"coffee"*, *"tea"*, *"cake"* vào ô tìm kiếm để trải nghiệm tốc độ gợi ý tức thì và cơ chế debounce.
