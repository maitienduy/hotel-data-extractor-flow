// Hàm parse bed types - fallback nếu prompt chưa chuẩn hóa
function parseBedTypes(bedTypeInput) {
  // Nếu đã là array enum (từ prompt mới), trả về trực tiếp
  if (Array.isArray(bedTypeInput)) {
    return bedTypeInput.filter((type) =>
      [
        "DOUBLE_BED",
        "TWIN_BED",
        "TRIPLE_BED",
        "QUEEN_BED",
        "KING_BED",
      ].includes(type)
    );
  }

  // Fallback: parse từ string (cho dữ liệu cũ)
  if (!bedTypeInput) return ["DOUBLE_BED"];

  const str = bedTypeInput.toUpperCase();
  const bedTypes = [];

  if (str.includes("DBL") || str.includes("1M8") || str.includes("DOUBLE")) {
    bedTypes.push("DOUBLE_BED");
  }
  if (str.includes("TWN") || str.includes("1M2") || str.includes("TWIN")) {
    bedTypes.push("TWIN_BED");
  }
  if (str.includes("TRIP") || str.includes("TRIPLE")) {
    bedTypes.push("TRIPLE_BED");
  }
  if (str.includes("QUEEN") || str.includes("QN") || str.includes("1M6")) {
    bedTypes.push("QUEEN_BED");
  }
  if (str.includes("KING") || str.includes("KG") || str.includes("2M")) {
    bedTypes.push("KING_BED");
  }

  return bedTypes.length > 0 ? bedTypes : ["DOUBLE_BED"];
}

// Hàm parse extra bed type - fallback nếu prompt chưa chuẩn hóa
function parseExtraBedType(extraBedInput) {
  // Nếu không có thông tin, trả về null
  if (!extraBedInput || extraBedInput === null || extraBedInput === undefined) {
    return null;
  }

  // Nếu đã là enum (từ prompt mới), trả về trực tiếp (chỉ EXTRA_BED, không có NONE)
  if (typeof extraBedInput === "string") {
    if (extraBedInput === "EXTRA_BED") {
      return "EXTRA_BED";
    }
    // Nếu là "NONE" hoặc không hợp lệ, trả về null
    return null;
  }

  // Fallback: parse từ object cũ {available: true/false} hoặc {type: "EXTRA_BED"}
  if (typeof extraBedInput === "object") {
    // Nếu có type field
    if (extraBedInput.type) {
      return extraBedInput.type === "EXTRA_BED" ? "EXTRA_BED" : null;
    }
    // Nếu có available field
    if (extraBedInput.hasOwnProperty("available")) {
      return extraBedInput.available ? "EXTRA_BED" : null;
    }
  }

  // Không có thông tin rõ ràng, trả về null
  return null;
}

function convertHotelData(sourceData) {
  const { hotel_info, room_types, inclusions, surcharges } = sourceData;

  // Chuyển đổi room types
  const roomPricingData = [];
  const rooms = room_types.map((room, index) => {
    // Parse bed types - hỗ trợ cả format mới (array enum) và format cũ (string)
    const bedTypes = parseBedTypes(room.bed_type);

    // Parse extra bed type - hỗ trợ cả format mới (enum) và format cũ (object với available)
    const extraBedType = parseExtraBedType(room.extra_bed);
    const hasExtraBed = extraBedType === "EXTRA_BED";

    // Chuẩn hóa view: bỏ giá trị null/"null"/rỗng
    const normalizedView = (() => {
      const v = room.view;
      if (v === undefined || v === null) return [];
      const s = String(v).trim();
      if (!s || s.toLowerCase() === "null") return [];
      return [s];
    })();

    // Xác định có bao gồm bữa sáng dựa trên inclusions
    const breakfastIncluded = (() => {
      const inc =
        Array.isArray(inclusions) && inclusions.length > 0
          ? inclusions.join(" ").toLowerCase()
          : "";
      return (
        inc.includes("breakfast") ||
        inc.includes("sáng") ||
        inc.includes("ăn sáng")
      );
    })();

    // Lấy bed size description từ bed_type_description hoặc bed_type (fallback)
    const bedSize =
      room.bed_type_description ||
      (typeof room.bed_type === "string" ? room.bed_type : "") ||
      "";

    // Tạo object room, chỉ thêm extraBedType nếu có giá trị (không null)
    const roomObj = {
      code: `${room.room_type.replace(/\s+/g, "_").toUpperCase()}_${index + 1}`,
      globalName: room.room_type,
      localName: room.room_type,
      bedTypes: bedTypes,
      bedSize: bedSize,
      area: parseInt(room.room_size) || 0,
      view: normalizedView,
      isSmokingAllowed: false,
      isBreakfastIncluded: breakfastIncluded,
      // bathroomType: "PRIVATE",
      maxExtraBeds: hasExtraBed ? 1 : 0,
      maxCapacity: room.capacity.total + (hasExtraBed ? 1 : 0),
      maxAdultCapacity: room.capacity.adults + (hasExtraBed ? 1 : 0),
      maxChildrenCapacity: room.capacity.children,
      maxAdults: room.capacity.adults,
      maxChildren: room.capacity.children,
      // childrenAgeRange: "0-11 tuổi",
      // freeChildrenAgeDescription: "Trẻ em 0-5 tuổi miễn phí",
      description: "",
      keyFeatures: [],
      prices: [],
    };

    // Chỉ thêm extraBedType nếu có giá trị (không null)
    if (extraBedType !== null) {
      roomObj.extraBedType = extraBedType;
    }

    // Lưu lại thông tin pricing kèm code phòng để cấu hình giá sau
    roomPricingData.push({
      code: roomObj.code,
      pricing: room.pricing || {},
    });

    return roomObj;
  });

  // Map nhanh room theo code để cấu hình giá vào đúng phòng
  const roomMap = rooms.reduce((acc, r) => {
    acc[r.code] = r;
    return acc;
  }, {});

  // Hàm xác định day.name và dayOfWeek dựa trên thông tin từ prompt
  function parseDayInfo(dayOfWeekInput) {
    // Nếu không có thông tin, mặc định áp dụng cho tất cả ngày
    if (!dayOfWeekInput || dayOfWeekInput.length === 0) {
      return {
        weekday: { name: "WEEKDAY", dayOfWeek: [0, 1, 2, 3, 4] },
        weekend: { name: "WEEKEND", dayOfWeek: [5, 6] },
      };
    }

    // Nếu đã có dayOfWeek từ prompt, sử dụng trực tiếp
    const dayOfWeek = Array.isArray(dayOfWeekInput) ? dayOfWeekInput : [];

    // Phân loại thành WEEKDAY và WEEKEND
    const weekdayDays = dayOfWeek.filter((d) => d >= 0 && d <= 4);
    const weekendDays = dayOfWeek.filter((d) => d >= 5 && d <= 6);

    const result = {};

    if (weekdayDays.length > 0) {
      result.weekday = { name: "WEEKDAY", dayOfWeek: weekdayDays };
    }

    if (weekendDays.length > 0) {
      result.weekend = { name: "WEEKEND", dayOfWeek: weekendDays };
    }

    // Nếu không có cả hai, mặc định tạo cả hai
    if (!result.weekday && !result.weekend) {
      return {
        weekday: { name: "WEEKDAY", dayOfWeek: [0, 1, 2, 3, 4] },
        weekend: { name: "WEEKEND", dayOfWeek: [5, 6] },
      };
    }

    return result;
  }

  // Hàm tính toán periods từ months và validity_period
  function calculatePeriodsFromMonths(months, validityPeriod) {
    if (!months || months.length === 0) return [];

    const validityStart = validityPeriod?.start_date;
    const validityEnd = validityPeriod?.end_date;

    if (!validityStart) {
      // Fallback: sử dụng năm hiện tại
      const currentYear = new Date().getFullYear();
      const firstMonth = Math.min(...months);
      const lastMonth = Math.max(...months);
      const lastDay = new Date(currentYear, lastMonth, 0).getDate();

      return [
        {
          startDate: `${currentYear}-${String(firstMonth).padStart(
            2,
            "0"
          )}-01T00:00:00Z`,
          endDate: `${currentYear}-${String(lastMonth).padStart(
            2,
            "0"
          )}-${String(lastDay).padStart(2, "0")}T23:59:59Z`,
        },
      ];
    }

    // Parse start date để lấy năm
    const startDate = new Date(validityStart);
    const startYear = startDate.getFullYear();

    // Sắp xếp months
    const sortedMonths = [...months].sort((a, b) => a - b);
    const firstMonth = sortedMonths[0];
    const lastMonth = sortedMonths[sortedMonths.length - 1];

    // Xác định năm kết thúc (nếu tháng cuối < tháng đầu thì là năm sau)
    let endYear = startYear;
    if (lastMonth < firstMonth && sortedMonths.length > 1) {
      endYear = startYear + 1;
    }

    // Tính ngày cuối của tháng cuối
    const lastDay = new Date(endYear, lastMonth, 0).getDate();

    // Nếu có validity_end và không phải "until_further_notice", sử dụng nó
    let endDateStr = `${endYear}-${String(lastMonth).padStart(2, "0")}-${String(
      lastDay
    ).padStart(2, "0")}T23:59:59Z`;
    if (validityEnd && validityEnd !== "until_further_notice") {
      endDateStr = `${validityEnd}T23:59:59Z`;
    }

    return [
      {
        startDate: `${startYear}-${String(firstMonth).padStart(
          2,
          "0"
        )}-01T00:00:00Z`,
        endDate: endDateStr,
      },
    ];
  }

  // Chuyển đổi seasons từ pricing
  const seasons = [];
  const validityPeriod = sourceData.validity_period || {};

  // Lấy pricing mẫu (giả định áp dụng chung cho các room; nếu khác nhau sẽ dùng priceConfigs ở dưới)
  // Ưu tiên phòng đầu tiên có trường pricing để làm anchor
  const sampleRoom =
    room_types.find((r) => r && r.pricing) || room_types[0] || {};

  // Low season
  if (sampleRoom?.pricing?.low_season) {
    const lowSeasonMonths = sampleRoom.pricing.low_season.months || [];
    const periods = calculatePeriodsFromMonths(lowSeasonMonths, validityPeriod);
    const dayInfo = parseDayInfo(sampleRoom.pricing.low_season.dayOfWeek);

    if (periods.length > 0) {
      // Tạo season cho WEEKDAY nếu có
      if (dayInfo.weekday) {
        seasons.push({
          name: "Mùa thấp điểm - Ngày thường",
          type: "SEASON",
          season: "LOW",
          day: dayInfo.weekday,
          eventData: null,
          periods: periods,
          description:
            sampleRoom.pricing.low_season.period || "Mùa thấp điểm",
          createdBy: "system",
        });
      }

      // Tạo season cho WEEKEND nếu có
      if (dayInfo.weekend) {
        seasons.push({
          name: "Mùa thấp điểm - Cuối tuần",
          type: "SEASON",
          season: "LOW",
          day: dayInfo.weekend,
          eventData: null,
          periods: periods,
          description:
            sampleRoom.pricing.low_season.period || "Mùa thấp điểm",
          createdBy: "system",
        });
      }
    }
  }

  // High season
  if (sampleRoom?.pricing?.high_season) {
    const highSeasonMonths = sampleRoom.pricing.high_season.months || [];
    const periods = calculatePeriodsFromMonths(
      highSeasonMonths,
      validityPeriod
    );
    const dayInfo = parseDayInfo(sampleRoom.pricing.high_season.dayOfWeek);

    if (periods.length > 0) {
      // Tạo season cho WEEKDAY nếu có
      if (dayInfo.weekday) {
        seasons.push({
          name: "Mùa cao điểm - Ngày thường",
          type: "SEASON",
          season: "HIGH",
          day: dayInfo.weekday,
          eventData: null,
          periods: periods,
          description:
            sampleRoom.pricing.high_season.period || "Mùa cao điểm",
          createdBy: "system",
        });
      }

      // Tạo season cho WEEKEND nếu có
      if (dayInfo.weekend) {
        seasons.push({
          name: "Mùa cao điểm - Cuối tuần",
          type: "SEASON",
          season: "HIGH",
          day: dayInfo.weekend,
          eventData: null,
          periods: periods,
          description:
            sampleRoom.pricing.high_season.period || "Mùa cao điểm",
          createdBy: "system",
        });
      }
    }
  }

  // Peak season (nếu có)
  if (
    sampleRoom?.pricing?.peak_season &&
    sampleRoom.pricing.peak_season.price &&
    sampleRoom.pricing.peak_season.months &&
    sampleRoom.pricing.peak_season.months.length > 0
  ) {
    const peakSeasonMonths = sampleRoom.pricing.peak_season.months;
    const periods = calculatePeriodsFromMonths(
      peakSeasonMonths,
      validityPeriod
    );
    const dayInfo = parseDayInfo(sampleRoom.pricing.peak_season.dayOfWeek);

    if (periods.length > 0) {
      // Tạo season cho WEEKDAY nếu có
      if (dayInfo.weekday) {
        seasons.push({
          name: "Mùa cao điểm đặc biệt - Ngày thường",
          type: "SEASON",
          season: "PEAK",
          day: dayInfo.weekday,
          eventData: null,
          periods: periods,
          description:
            sampleRoom.pricing.peak_season.period || "Mùa cao điểm đặc biệt",
          createdBy: "system",
        });
      }

      // Tạo season cho WEEKEND nếu có
      if (dayInfo.weekend) {
        seasons.push({
          name: "Mùa cao điểm đặc biệt - Cuối tuần",
          type: "SEASON",
          season: "PEAK",
          day: dayInfo.weekend,
          eventData: null,
          periods: periods,
          description:
            sampleRoom.pricing.peak_season.period || "Mùa cao điểm đặc biệt",
          createdBy: "system",
        });
      }
    }
  }

  // Holiday surcharges - EVENT type
  if (surcharges?.holiday_surcharge?.applicable_dates) {
    surcharges.holiday_surcharge.applicable_dates.forEach((holiday) => {
      if (holiday.dates) {
        holiday.dates.forEach((date) => {
          // Với EVENT, xác định ngày trong tuần của date đó
          const eventDate = new Date(date);
          const dayOfWeek = eventDate.getDay(); // 0=Chủ nhật, 1=Thứ 2, ..., 6=Thứ 7

          // Xác định là WEEKDAY hay WEEKEND
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          const dayName = isWeekend ? "WEEKEND" : "WEEKDAY";

          seasons.push({
            name: holiday.name,
            type: "EVENT",
            season: "PEAK",
            day: {
              name: dayName,
              dayOfWeek: [dayOfWeek],
            },
            eventData: {
              name: holiday.name,
              startDate: `${date}T00:00:00Z`,
              endDate: `${date}T23:59:59Z`,
              description: `Phụ thu ${surcharges.holiday_surcharge.rate}`,
            },
            periods: [
              {
                startDate: `${date}T00:00:00Z`,
                endDate: `${date}T23:59:59Z`,
              },
            ],
            description: `${holiday.name} - Phụ thu ${surcharges.holiday_surcharge.rate}`,
            createdBy: "system",
          });
        });
      } else if (holiday.start_date && holiday.end_date) {
        // Với range date, tạo cho cả WEEKDAY và WEEKEND
        const startDate = new Date(holiday.start_date);
        const endDate = new Date(holiday.end_date);

        // Tạo event cho WEEKDAY
        const weekdayDays = [];
        const weekendDays = [];

        // Tính toán các ngày trong range
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
          const dayOfWeek = currentDate.getDay();
          if (dayOfWeek === 0 || dayOfWeek === 6) {
            if (!weekendDays.includes(dayOfWeek)) {
              weekendDays.push(dayOfWeek);
            }
          } else {
            if (!weekdayDays.includes(dayOfWeek)) {
              weekdayDays.push(dayOfWeek);
            }
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }

        // Tạo season cho WEEKDAY nếu có
        if (weekdayDays.length > 0) {
          seasons.push({
            name: holiday.name,
            type: "EVENT",
            season: "PEAK",
            day: {
              name: "WEEKDAY",
              dayOfWeek: weekdayDays,
            },
            eventData: {
              name: holiday.name,
              startDate: `${holiday.start_date}T00:00:00Z`,
              endDate: `${holiday.end_date}T23:59:59Z`,
              description: `Phụ thu ${surcharges.holiday_surcharge.rate}`,
            },
            periods: [
              {
                startDate: `${holiday.start_date}T00:00:00Z`,
                endDate: `${holiday.end_date}T23:59:59Z`,
              },
            ],
            description: `${holiday.name} - Phụ thu ${surcharges.holiday_surcharge.rate}`,
            createdBy: "system",
          });
        }

        // Tạo season cho WEEKEND nếu có
        if (weekendDays.length > 0) {
          seasons.push({
            name: holiday.name,
            type: "EVENT",
            season: "PEAK",
            day: {
              name: "WEEKEND",
              dayOfWeek: weekendDays,
            },
            eventData: {
              name: holiday.name,
              startDate: `${holiday.start_date}T00:00:00Z`,
              endDate: `${holiday.end_date}T23:59:59Z`,
              description: `Phụ thu ${surcharges.holiday_surcharge.rate}`,
            },
            periods: [
              {
                startDate: `${holiday.start_date}T00:00:00Z`,
                endDate: `${holiday.end_date}T23:59:59Z`,
              },
            ],
            description: `${holiday.name} - Phụ thu ${surcharges.holiday_surcharge.rate}`,
            createdBy: "system",
          });
        }
      }
    });
  }

  // Map season name theo season/day để cấu hình giá
  const seasonNameIndex = seasons.reduce((acc, s) => {
    const key = `${s.season}_${s.day?.name || "ALL"}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s.name);
    return acc;
  }, {});

  // Lưu meta season để đưa periods/dayType vào giá phòng
  const seasonMeta = seasons.reduce((acc, s) => {
    acc[s.name] = {
      periods: s.periods || [],
      dayType: s.day?.name || "WEEKDAY",
    };
    return acc;
  }, {});

  // Enum defaults & allowed sets (fallback khi thiếu thông tin)
  const enumDefaults = {
    unitType: "FIXED_AMOUNT", // PERCENTAGE | FIXED_AMOUNT
    cancellationPeriodUnitTime: "DAY", // DAY | HOUR
    condition: "FREE_CANCELLATION", // FREE_CANCELLATION | CANCELLATION_CHARGE | NO_CANCELLATION
    mealPlan: "RO", // RO, BB, HB, FB, AI, UAI, CP, MAP, AP, EP, BFI, BFLI, BFDI, AMI, AMD, FBD, KEF, STTI
    dayType: "WEEKDAY", // WEEKDAY | WEEKEND
  };

  const enumSets = {
    unitType: ["PERCENTAGE", "FIXED_AMOUNT"],
    cancellationPeriodUnitTime: ["DAY", "HOUR"],
    condition: ["FREE_CANCELLATION", "CANCELLATION_CHARGE", "NO_CANCELLATION"],
    mealPlan: [
      "RO",
      "BB",
      "HB",
      "FB",
      "AI",
      "UAI",
      "CP",
      "MAP",
      "AP",
      "EP",
      "BFI",
      "BFLI",
      "BFDI",
      "AMI",
      "AMD",
      "FBD",
      "KEF",
      "STTI",
    ],
    dayType: ["WEEKDAY", "WEEKEND"],
  };

  function pickEnum(value, type) {
    const allowed = enumSets[type] || [];
    if (allowed.includes(value)) return value;
    return enumDefaults[type];
  }

  // Hàm helper để đẩy giá theo season
  function pushPriceToRoom(roomCode, seasonKey, price) {
    if (!price || price === null || price === undefined) return;
    const seasonNames = seasonNameIndex[seasonKey] || [];
    seasonNames.forEach((name) => {
      const room = roomMap[roomCode];
      if (!room) return;
      const meta = seasonMeta[name] || {};
      // Cho phép price là number hoặc object có metadata
      const priceValue =
        typeof price === "object" && price !== null ? price.price : price;
      const mealPlan =
        typeof price === "object" && price !== null
          ? pickEnum(price.mealPlan, "mealPlan")
          : enumDefaults.mealPlan;
      const condition =
        typeof price === "object" && price !== null
          ? pickEnum(price.condition, "condition")
          : enumDefaults.condition;
      const cancellationPeriod =
        typeof price === "object" && price !== null
          ? Number(price.cancellationPeriod) || 0
          : 0;
      const cancellationPeriodUnitTime =
        typeof price === "object" && price !== null
          ? pickEnum(price.cancellationPeriodUnitTime, "cancellationPeriodUnitTime")
          : enumDefaults.cancellationPeriodUnitTime;
      const unitType =
        typeof price === "object" && price !== null
          ? pickEnum(price.unitType, "unitType")
          : enumDefaults.unitType;
      const amount =
        typeof price === "object" && price !== null
          ? Number(price.amount) || 0
          : 0;
      room.prices.push({
        mealPlan,
        countries: [],
        price: Number(priceValue) || 0,
        seasonName: name,
        periods: meta.periods,
        condition,
        cancellationPeriod,
        cancellationPeriodUnitTime,
        unitType,
        amount,
        dayType: pickEnum(meta.dayType, "dayType"),
      });
    });
  }

  // Tạo prices cho từng phòng (nằm trong rooms)
  roomPricingData.forEach(({ code, pricing }) => {
    if (pricing?.low_season) {
      pushPriceToRoom(code, "LOW_WEEKDAY", pricing.low_season.price);
      pushPriceToRoom(code, "LOW_WEEKEND", pricing.low_season.price);
    }
    if (pricing?.high_season) {
      pushPriceToRoom(code, "HIGH_WEEKDAY", pricing.high_season.price);
      pushPriceToRoom(code, "HIGH_WEEKEND", pricing.high_season.price);
    }
    if (pricing?.peak_season) {
      pushPriceToRoom(code, "PEAK_WEEKDAY", pricing.peak_season.price);
      pushPriceToRoom(code, "PEAK_WEEKEND", pricing.peak_season.price);
    }
  });

  // Xác định type của khách sạn
  let hotelType = hotel_info.type;

  // Nếu không có type từ prompt, xử lý tự động dựa trên số sao
  if (!hotelType || hotelType === null || hotelType === undefined) {
    const starRating = parseInt(hotel_info.rating) || 0;
    // >= 3 sao thì mặc định là RESORT
    hotelType = starRating >= 3 ? "RESORT" : "HOTEL";
  }

  // Validate enum type
  const validTypes = [
    "HOTEL",
    "MOTEL",
    "MOTEL_INN",
    "RESORT",
    "BOUTIQUE",
    "HOMESTAY",
  ];
  if (!validTypes.includes(hotelType)) {
    // Nếu type không hợp lệ, fallback về logic số sao
    const starRating = parseInt(hotel_info.rating) || 0;
    hotelType = starRating >= 3 ? "RESORT" : "HOTEL";
  }

  // Tạo object kết quả
  const result = {
    localName: hotel_info.name,
    globalName: hotel_info.name,
    type: hotelType,
    address: hotel_info.address,
    star: hotel_info.rating?.toString() || '2',
    serviceScope: "LOCAL",
    //   checkInHouse: "14:00",
    //   checkOutHouse: "12:00",
    area: hotel_info.location,
    //   lat: 0,
    //   lng: 0,
    //   image: 0,
    //   nearbyAttractions: [],
    keyFeatures: inclusions || [],
    code: hotel_info.name.replace(/\s+/g, "_").toUpperCase(),
    // bank_details: removed per prompt
    // contact_person: removed per prompt
    //   source: "ACP",
    //   wardId: 0,
    seasons: seasons,
    rooms: rooms,
  };

  return result;
}
//const rawData = input[0];
const rawData = $input.all()[0].json;
const result = convertHotelData(rawData);
//console.log(result);
return result;
