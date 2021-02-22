'use-strict';

const toggleShow = document.getElementById('toggle-show-info');
const blockInfo = document.getElementsByClassName('block-info')[0];

document.addEventListener('DOMContentLoaded', () => {
  setTranslateToElement(blockInfo, `-${calculateHeightDiff(blockInfo, toggleShow)}px`);
})

const calculateHeightDiff = (el1, el2) => {
  return el1.clientHeight - el2.clientHeight;
}

const setTranslateToElement = (el, prop) => {
  el.style.transform = `translateY(${prop})`
}

toggleShow.onclick = () => {
  if (blockInfo.classList.contains('show')) {
    blockInfo.classList.remove('show');
    setTranslateToElement(blockInfo, `-${calculateHeightDiff(blockInfo, toggleShow)}px`);
  } else {
    blockInfo.classList.add('show');
    setTranslateToElement(blockInfo, '0');
  }
}