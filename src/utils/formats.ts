import * as moment from "moment";

export const formatDate = (date: string) => {
  return moment(new Date(date)).format("DD/MM/YYYY")
}