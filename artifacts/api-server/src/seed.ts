import { db, participantsTable } from "@workspace/db";
import { count } from "drizzle-orm";
import { logger } from "./lib/logger";

const SEED_DATA = [
  {
    imie: "Karolina",
    nazwisko: "Czubińska",
    pesel: "97081106024",
    email: "Karolinaczubinska6@gmail.com",
    telefon: "515316371",
    adres: "ul. Próchnika 23 m 35",
    kodPocztowy: "90-708",
    miasto: "Łódź",
    loginPortal: "Karolinaczubinska6@gmail.com",
    haslo: "Diana1988@",
    notatki: "",
    validationStatus: "ok" as const,
  },
  {
    imie: "Ania",
    nazwisko: "Bizewska",
    pesel: "71102607185",
    email: "Bizewskaania080@gmail.com",
    telefon: "511374530",
    adres: "ul. Przędzalniana 30 m 8/9",
    kodPocztowy: "90-035",
    miasto: "Łódź",
    loginPortal: "Bizewskaania080@gmail.com",
    haslo: "Diana1988@",
    notatki: "",
    validationStatus: "ok" as const,
  },
  {
    imie: "Justyna",
    nazwisko: "Sztygieł",
    pesel: "96051707300",
    email: "justynaj957@gmail.com",
    telefon: "690277201",
    adres: "ul. Bojowników Getta Warszawskiego 18/16",
    kodPocztowy: "91-438",
    miasto: "Łódź",
    loginPortal: "justynaj957@gmail.com",
    haslo: "Diana1988@",
    notatki: "",
    validationStatus: "ok" as const,
  },
  {
    imie: "Maja",
    nazwisko: "Banaszkiewicz",
    pesel: "94110813623",
    email: "m.saanndra@gmail.com",
    telefon: "514666089",
    adres: "ul. Limanowskiego 59/40",
    kodPocztowy: "91-329",
    miasto: "Łódź",
    loginPortal: "m.saanndra@gmail.com",
    haslo: "Diana1988@",
    notatki: "",
    validationStatus: "ok" as const,
  },
  {
    imie: "Aldona",
    nazwisko: "Baleja",
    pesel: "68050810943",
    email: "Balejaaldona7@gmail.com",
    telefon: "513622701",
    adres: "ul. Plantowa 17/24",
    kodPocztowy: "91-104",
    miasto: "Łódź",
    loginPortal: "Balejaaldona7@gmail.com",
    haslo: "Diana1988@",
    notatki: "",
    validationStatus: "ok" as const,
  },
  {
    imie: "Izabela",
    nazwisko: "Baszczyńska",
    pesel: "82080517863",
    email: "Izabelabaszczynska38@gmail.com",
    telefon: "666385702",
    adres: "ul. Powstańców Wielkopolskich 16/2",
    kodPocztowy: "91-040",
    miasto: "Łódź",
    loginPortal: "Izabelabaszczynska38@gmail.com",
    haslo: "Diana1988@",
    notatki: "",
    validationStatus: "ok" as const,
  },
  {
    imie: "Małgorzata",
    nazwisko: "Świderek",
    pesel: "82082709703",
    email: "Gosiaswiderek46@gmail.com",
    telefon: "609165138",
    adres: "ul. Główna 80/1",
    kodPocztowy: "96-124",
    miasto: "Maków",
    loginPortal: "Gosiaswiderek46@gmail.com",
    haslo: "Diana1988@",
    notatki: "",
    validationStatus: "ok" as const,
  },
  {
    imie: "Sandra",
    nazwisko: "Baleja",
    pesel: "88050605703",
    email: "Akademiasandrabaleja@gmail.com",
    telefon: "500592850",
    adres: "ul. Traktorowa 89 m 11",
    kodPocztowy: "91-203",
    miasto: "Łódź",
    loginPortal: "Akademiasandrabaleja@gmail.com",
    haslo: "Diana1988@",
    notatki: "bezrobotna zarejestrowana w UP; wykształcenie średnie; nieprowadząca działalności",
    validationStatus: "ok" as const,
  },
];

export async function seedParticipants() {
  try {
    const [result] = await db.select({ total: count() }).from(participantsTable);
    if (result && result.total > 0) {
      logger.info({ count: result.total }, "Participants already exist, skipping seed");
      return;
    }

    logger.info("Seeding 8 participants...");
    for (const p of SEED_DATA) {
      await db.insert(participantsTable).values(p);
    }
    logger.info("Seed complete: 8 participants inserted");
  } catch (err) {
    logger.error({ err }, "Seed failed");
  }
}
