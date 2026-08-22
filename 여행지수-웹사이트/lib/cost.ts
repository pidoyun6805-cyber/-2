// 총 여행경비 계산: 항공권 + 숙박 + 도시별 1일 체류비(식비+현지교통+잡비)
export interface DailyCost {
  food: number;
  localTransport: number;
  misc: number;
}

export interface TotalCostInputs {
  flightPricePerPerson: number;
  hotelPricePerNight: number;
  nights: number;
  people: number;
  dailyCost: DailyCost;
}

export interface TotalCostResult {
  flightTotal: number;
  hotelTotal: number;
  dailyCostTotal: number;
  grandTotal: number;
}

export function calcTotalCost(inputs: TotalCostInputs): TotalCostResult {
  const { flightPricePerPerson, hotelPricePerNight, nights, people, dailyCost } = inputs;

  const flightTotal = flightPricePerPerson * people;
  const hotelTotal = hotelPricePerNight * nights;
  const dailyCostPerPersonPerNight = dailyCost.food + dailyCost.localTransport + dailyCost.misc;
  const dailyCostTotal = dailyCostPerPersonPerNight * people * nights;

  return {
    flightTotal,
    hotelTotal,
    dailyCostTotal,
    grandTotal: flightTotal + hotelTotal + dailyCostTotal,
  };
}
