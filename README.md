Project phục vụ việc extract data từ file pdf qua promt AI. Từ kết quả extract đi qua hàm transform để convert thành input cho API dưới đây
Cac step la 1 phan flow cua n8n
>> API
https://acp-hotel-svc-dev.airdata.site/ahsa/swagger/#/Import%20Hotel/ImportHotelController.importHotel
flow
@currentAiResponse [] > entity >transform > apiInput
# hotel-data-extractor-flow
