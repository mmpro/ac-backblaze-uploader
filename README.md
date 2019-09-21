# AC Backblaze Uploader
Uploads from URL to Backblaze - small files via direct upload, big file (> 5MB) using multipart upload.

## Usage

```
const acb2 = require('./index')

let backblaze = {
  applicationKeyId: 'xxx',
  applicationKey: 'yyyy',
  bucketId: 'zzz',
  encryption: {
    enabled: true,
    password: 'very-good-password',
    algorithm: 'aes256' // default
  }
}

acb2.init(backblaze)

acb2.upload({
  url: URL,
  fileName: 'ABC'
}, (err, res) => {
  console.log(5, err, res)
})

```

## ToDos
+ add file upload

## Links
- [Website](https://www.admiralcloud.com/)
- [Twitter (@admiralcloud)](https://twitter.com/admiralcloud)
- [Facebook](https://www.facebook.com/MediaAssetManagement/)

## Thanks
Thanks to https://github.com/yakovkhalinsky/backblaze-b2

## License
[MIT License](https://opensource.org/licenses/MIT) Copyright © 2009-present, AdmiralCloud, Mark Poepping