// Manufacturer paint names from Indian-market model pages/brochures.
// These are suggestions across model years, not a year/trim availability check.
// Unlisted models and shades use Other; never borrow another model's palette.
const VEHICLE_COLORS: Record<string, Record<string, { colors: string[]; source: string }>> = {
  Toyota: {
    Camry: {
      colors: ["Metal Stream Metallic", "Platinum White Pearl", "Silver Metallic", "Graphite Metallic", "Red Mica", "Attitude Black", "Burning Black"],
      source: "https://www.toyotabharat.com/news/2022/toyota-kirloskar-motor-launches-the-new-camry-hybrid.html",
    },
    Glanza: {
      colors: ["Café White", "Sporting Red", "Gaming Grey", "Enticing Silver", "Insta Blue"],
      source: "https://www.toyotabharat.com/news/2022/tkm-launches-its-much-awaited-hatchback-the-cool-new-toyota-glanza.html",
    },
    Innova: {
      colors: ["Super White", "Silver Mica Metallic", "Dark Red Mica Metallic", "Blue Metallic", "Grey Mica Metallic"],
      source: "https://content.toyotabharat.com/v9online/specs/innova-bmc-specs.html",
    },
    "Innova Crysta": {
      colors: ["Super White", "Platinum White Pearl", "Silver Metallic", "Attitude Black Mica", "Avant-Garde Bronze Metallic"],
      source: "https://www.toyotabharat.com/documents/brochures/innova-mmc/e-brochure-innova-crysta.pdf",
    },
    Fortuner: {
      colors: ["Super White", "Pearl White", "Silver Metallic", "Grey", "Attitude Black", "Phantom Brown Metallic", "Avant Garde Bronze"],
      source: "https://www.toyotabharat.com/news/2016/discover-the-power-of-all-new-fortuner-in-the-fortuner-experiential-drive-camp.html",
    },
    "Innova Hycross": {
      colors: ["Blackish Ageha Glass Flake", "Platinum White Pearl", "Attitude Black Mica", "Sparkling Black Pearl Crystal Shine", "Silver Metallic", "Super White", "Avant Garde Bronze Metallic"],
      source: "https://www.toyotabharat.com/news/2024/tkm-introduces-new-innova-hycross-petrol-gx-o-grade.html",
    },
    "Urban Cruiser": {
      colors: ["Rustic Brown", "Suave Silver", "Groovy Orange", "Iconic Grey", "Spunky Blue", "Sunny White", "Rustic Brown with Sizzling Black Roof", "Groovy Orange with Sunny White Roof", "Spunky Blue with Sizzling Black Roof"],
      source: "https://www.toyotabharat.com/news/2020/tkm-launches-its-much-awaited-compact-suv-in-india-the-all-new-toyota-urban-cruiser.html",
    },
    "Urban Cruiser Hyryder": {
      colors: ["Cafe White", "Enticing Silver", "Gaming Grey", "Sportin Red", "Midnight Black", "Cave Black", "Speedy Blue", "Cafe White X Midnight Black", "Sportin Red X Midnight Black", "Enticing Silver X Midnight Black", "Speedy Blue X Midnight Black"],
      source: "https://www.toyotabharat.com/showroom/urbancruiser-hyryder/",
    },
    Rumion: {
      colors: ["Spunky Blue", "Rustic Brown", "Iconic Grey", "Cafe White", "Enticing Silver"],
      source: "https://www.toyotabharat.com/showroom/rumion/",
    },
  },
  "Maruti Suzuki": {
    Swift: {
      colors: ["Pearl Arctic White", "Sizzling Red", "Luster Blue", "Novel Orange", "Magma Grey", "Splendid Silver", "Sizzling Red with Midnight Black Roof", "Luster Blue with Midnight Black Roof", "Pearl Arctic White with Midnight Black Roof"],
      source: "https://www.marutisuzuki.com/arena/swift",
    },
    "Swift Dzire": {
      colors: ["Pacific Blue", "Glistening Grey", "Bright Red", "Arctic White", "Clear Beige", "Silky Silver", "Midnight Black"],
      source: "https://www.marutisuzuki.com/corporate/media/press-releases/2012/february/maruti-suzuki-unveils-the-new-swift-dzire",
    },
    Dzire: {
      colors: ["Alluring Blue", "Gallant Red", "Nutmeg Brown", "Arctic White", "Splendid Silver", "Bluish Black", "Magma Grey"],
      source: "https://www.marutisuzuki.com/corporate/media/press-releases/2024/november/maruti-suzuki-launches-all-new-dzire-unmatched-style-unrivalled-performance",
    },
    "Alto K10": {
      colors: ["Superior White", "Silky Silver", "Midnight Black", "Sunlight Copper", "Fire Brick Red", "Ecru Beige"],
      source: "https://www.marutisuzuki.com/corporate/media/press-releases/2010/august/maruti-suzuki-launches-alto-k10",
    },
    "Wagon R": {
      colors: ["Superior White", "Autumn Orange", "Silky Silver", "Nutmeg Brown", "Magma Grey", "Poolside Blue"],
      source: "https://www.marutisuzuki.com/-/media/files/maruti/documents/wagonr_brochure.ashx?modified=20190301080201",
    },
    Baleno: {
      colors: ["NEXA Blue", "Grandeur Grey", "Arctic White", "Splendid Silver", "Opulent Red", "Luxe Beige"],
      source: "https://www.nexaexperience.com/-/media/feature/nexawebsiteherobanner/brochure/baleno_brochure.pdf?modified=20200312061448",
    },
    Ertiga: {
      colors: ["Pearl Metallic Auburn Red", "Dignity Brown", "Metallic Magma Grey", "Pearl Metallic Oxford Blue", "Pearl Arctic White", "Splendid Silver", "Bluish Black"],
      source: "https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/ertiga/document/ErtigaBrochure_6_Pgs_High_Res.pdf",
    },
  },
  Hyundai: {
    Creta: {
      colors: ["Robust Emerald Pearl", "Fiery Red", "Ranger Khaki", "Abyss Black", "Atlas White", "Titan Grey", "Atlas White with Abyss Black Roof"],
      source: "https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/cretabrochuree.pdf",
    },
    i20: {
      colors: ["Amazon Grey", "Abyss Black - Knight", "Fiery Red", "Atlas White", "Atlas White with Abyss Black", "Starry Night", "Titan Grey"],
      source: "https://www.hyundai.com/in/en/find-a-car/i20/highlights.html",
    },
    "Grand i10 Nios": {
      colors: ["Fiery Red", "Spark Green", "Typhoon Silver", "Teal Blue", "Polar White", "Titan Grey", "Spark Green with Phantom Black Roof", "Polar White with Phantom Black Roof"],
      source: "https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/grand-i10-nios.pdf",
    },
  },
  Honda: {
    City: {
      colors: ["Obsidian Blue Pearl", "Radiant Red Metallic", "Platinum White Pearl", "Golden Brown Metallic", "Meteoroid Gray Metallic", "Lunar Silver Metallic"],
      source: "https://www.hondacarindia.com/web-data/brochures/pdfs/Honda%20City%20Brochure%20dated%20June%2020.pdf",
    },
    Amaze: {
      colors: ["Meteoroid Grey Metallic", "Radiant Red Metallic", "Platinum White Pearl", "Lunar Silver Metallic", "Golden Brown Metallic", "Obsidian Blue Pearl", "Crystal Black Pearl"],
      source: "https://www.hondacarindia.com/honda-amaze/faq",
    },
  },
  Tata: {
    Nexon: {
      colors: ["Daytona Grey", "Flame Red", "Calgary White", "Ocean Blue"],
      source: "https://cars.tatamotors.com/content/dam/tml/pv/products/nexon/year-2023/mce2/promoting-vc/brochure/nexon-brochure-2023.pdf",
    },
    Punch: {
      colors: ["Orcus White", "Daytona Grey", "Tornado Blue", "Meteor Bronze"],
      source: "https://cars.tatamotors.com/content/dam/tml/pv/products/punch/year-2025/ice/promoting-vc/brochures/jan-2025/punch-brochure.pdf",
    },
  },
  Mahindra: {
    XUV700: {
      colors: ["Everest White", "Midnight Black", "Dazzling Silver", "Red Rage", "Electric Blue", "Stealth Black", "Deep Forest", "Burnt Sienna"],
      source: "https://auto.mahindra.com/on/demandware.static/-/Sites-amc-Library/default/dw92486f5b/X700/brochure/XUV700_BROCHURE_27_06_2024.pdf",
    },
    Thar: {
      colors: ["Deep Forest", "Everest White", "Red Rage", "Stealth Black", "Galaxy Grey"],
      source: "https://auto.mahindra.com/on/demandware.static/-/Sites-amc-Library/default/dw4acdf21e/brochure/Thar-Brochure-40-pages-4th-5-3-25.pdf",
    },
  },
  Kia: {
    Seltos: {
      colors: ["Imperial Blue", "Sparkling Silver", "Gravity Grey", "Aurora Black Pearl", "Intense Red", "Punchy Orange", "Glacier White Pearl", "Clear White", "Gravity Grey / Aurora Black Pearl", "Intense Red / Aurora Black Pearl", "Glacier White Pearl / Aurora Black Pearl", "Xclusive Matte Graphite"],
      source: "https://www.kia.com/content/dam/kia2/in/en/images/our-vehicles/seltos/showroom/MY_Seltos_16_Page_Brochure_2022_Desktop.pdf",
    },
    Sonet: {
      colors: ["Gravity Grey", "Aurora Black Pearl", "Glacier White Pearl", "Clear White", "Pewter Olive", "Imperial Blue", "Magma Red", "Glacier White Pearl + Aurora Black Pearl"],
      source: "https://www.kia.com/in/our-vehicles/sonet/showroom.html",
    },
  },
  Renault: {
    Kiger: {
      colors: ["Moonlight Silver", "Stealth Black", "Ice Cool White"],
      source: "https://www.renault.co.in/cars/renault-kiger/configurator.html",
    },
    Triber: {
      colors: ["Zanskar Blue", "Shadow Grey", "Moonlight Silver", "Stealth Black", "Ice Cool White", "Amber Terracotta with Mystery Black Roof", "Shadow Grey with Mystery Black Roof", "Ice Cool White with Mystery Black Roof"],
      source: "https://www.renault.co.in/cars/renault-triber.html",
    },
  },
  Nissan: {
    Magnite: {
      colors: ["Blade Silver", "Storm White", "Pearl White", "Vivid Blue", "Onyx Black", "Flare Garnet Red", "Sunrise Copper Orange", "Pearl White & Onyx Black", "Flare Garnet Red & Onyx Black", "Vivid Blue & Onyx Black", "Blade Silver & Onyx Black", "Sunrise Copper Orange & Onyx Black"],
      source: "https://dealers.nissan.in/assets/images/New_Nissan_Magnite_Brochure.pdf",
    },
  },
  Volkswagen: {
    Polo: {
      colors: ["Candy White", "Flash Red", "Reflex Silver", "Carbon Steel", "Sunset Red", "Lapiz Blue", "Toffee Brown"],
      source: "https://www.volkswagen.co.in/idhub/content/dam/onehub_pkw/importers/in/pdf/Polo-Brochure-Jan-21.pdf",
    },
  },
  Skoda: {
    Kushaq: {
      colors: ["Honey Orange", "Tornado Red", "Candy White", "Brilliant Silver"],
      source: "https://www.skoda-auto.co.in/_doc/af6d5276-a83f-4acd-a192-c2d622ac5aba",
    },
  },
  Ford: {
    EcoSport: {
      colors: ["Lightning Blue", "Canyon Ridge", "Race Red", "Diamond White", "Absolute Black", "Moondust Silver", "Smoke Grey"],
      source: "https://www.india.ford.com/about-ford/media/newsroom/2017/Ford-India-Introduces-New-EcoSport/",
    },
    Endeavour: {
      colors: ["Diffused Silver", "Moondust Silver", "Diamond White", "Absolute Black", "Sunset Red"],
      source: "https://www.india.ford.com/content/dam/Ford/website-assets/ap/in/nameplate/endeavour/brochure/New-Ford-Endeavour-Mobile-Brochure.pdf",
    },
  },
  MG: {
    Hector: {
      colors: ["Celadon Blue", "Pearl White", "Glaze Red", "Aurora Silver", "Starry Black"],
      source: "https://www.mgmotor.co.in/vehicles/mghector",
    },
  },
  "Mercedes-Benz": {
    GLC: {
      colors: ["Polar White", "Obsidian Black", "Mojave Silver", "Nautic Blue", "Selenite Grey"],
      source: "https://www.srmstar.mercedes-benz.co.in/content/dam/retail/india/brochure/mercedes_glc.pdf",
    },
  },
  BMW: {
    X1: {
      colors: ["Alpine White", "Black", "Mineral White Metallic", "Black Sapphire Metallic", "Sparkling Brown Metallic", "Sunset Orange Metallic", "Mediterranean Blue Metallic", "Misano Blue Metallic"],
      source: "https://www.bmw.in/content/dam/bmw/marketIN/bmw_in/brochure%20download/brochureupload/2022/May/The%20BMW%20X1.pdf.asset.1653662937590.pdf",
    },
  },
};

export function getVehicleColors(make: string, model: string): readonly string[] {
  return VEHICLE_COLORS[make]?.[model]?.colors ?? [];
}
