import axios from 'axios';

async function test() {
  try {
    const lat = 35.2357;
    const lon = 128.6826;
    const res = await axios.get(`https://photon.komoot.io/reverse?lon=${lon}&lat=${lat}`);
    console.log(res.data.features[0]);
  } catch (e) {
    console.error(e.message);
  }
}
test();
