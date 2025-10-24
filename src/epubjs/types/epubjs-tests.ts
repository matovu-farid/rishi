import ePub, { Book } from '../src';

function testEpub() {
  const epub = ePub("https://s3.amazonaws.com/moby-dick/moby-dick.epub");

  const book = new Book("https://s3.amazonaws.com/moby-dick/moby-dick.epub", {});
}

testEpub();
