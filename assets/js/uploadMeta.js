export async function getUploadMeta() {

  let ipv4 = "Unknown";
  let ipv6 = "Unknown";

  let city = "Unknown";
  let region = "Unknown";
  let country = "Unknown";
  let latitude = "";
  let longitude = "";

  try {

    // Run both APIs together (faster)
    const [ipRes, locRes] = await Promise.all([
      fetch("https://api.ipify.org?format=json"),
      fetch("https://ipapi.co/json/")
    ]);

    const ipData = await ipRes.json();
    const locData = await locRes.json();

    // IPv4
    ipv4 = ipData.ip || "Unknown";

    // IPv6 detection
    if (ipv4.includes(":")) {
      ipv6 = ipv4;
      ipv4 = "Unknown";
    }

    // Location data
    city = locData.city || "Unknown";
    region = locData.region || "Unknown";
    country = locData.country_name || "Unknown";

    latitude = locData.latitude || "";
    longitude = locData.longitude || "";

  } catch (err) {
    console.warn("IP metadata lookup failed:", err);
  }

  const now = new Date();

  // DATE → DD-Month-YYYY
  const day = String(now.getDate()).padStart(2,"0");

  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  const month = months[now.getMonth()];
  const year = now.getFullYear();

  const date = `${day}-${month}-${year}`;

  // TIME → HH:MM:SS AM/PM
  const time = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  // ===== Browser Detection =====
  const ua = navigator.userAgent;

  let browser = "Unknown";

  if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";

  // ===== OS Detection =====
  let os = "Unknown";

  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac")) os = "MacOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  // ===== Device =====
  const deviceType = /Mobi|Android|iPhone/i.test(ua) ? "Mobile" : "Desktop";

  return {

    uploadedIPv4: ipv4,
    uploadedIPv6: ipv6,

    uploadedCity: city,
    uploadedRegion: region,
    uploadedCountry: country,

    latitude: latitude,
    longitude: longitude,

    uploadedDate: date,
    uploadedTime: time,

    browser: browser,
    operatingSystem: os,
    deviceType: deviceType
  };
}