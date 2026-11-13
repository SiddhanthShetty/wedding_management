/** The three steps of Stays & travel, and whether each is done. */
export type TravelStepId = "hotel" | "assign" | "pickups";
export type TravelStep = { id: TravelStepId; title: string; status: string; done: boolean };

export function travelSteps(input: {
  properties: number; rooms: number; activeStays: number; journeys: number;
  roomsNotAssigned: number; arrivalsNotAssigned: number; departuresNotAssigned: number;
}): TravelStep[] {
  const hotelDone = input.properties > 0 && input.rooms > 0;
  const assignDone = hotelDone && input.activeStays > 0 && input.roomsNotAssigned === 0;
  const ridesLeft = input.arrivalsNotAssigned + input.departuresNotAssigned;
  const pickupsDone = input.journeys > 0 && ridesLeft === 0;
  return [
    { id: "hotel", title: "Add the hotel", done: hotelDone,
      status: hotelDone ? `${input.properties} place${input.properties === 1 ? "" : "s"} · ${input.rooms} room${input.rooms === 1 ? "" : "s"}` : input.properties ? "Add its rooms" : "Not started" },
    { id: "assign", title: "Assign families", done: assignDone,
      status: !hotelDone ? "After the hotel" : input.roomsNotAssigned ? `${input.roomsNotAssigned} still need a room` : input.activeStays ? "Everyone who needs a room has one" : "Nobody placed yet" },
    { id: "pickups", title: "Arrange pickups", done: pickupsDone,
      status: ridesLeft ? `${ridesLeft} ride${ridesLeft === 1 ? "" : "s"} still to arrange` : input.journeys ? "All rides arranged" : "Not started" },
  ];
}
