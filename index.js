const _ = require('lodash')
const async = require('async')

const B2 = require('backblaze-b2');
const axios = require('axios')

const acb2 = function() {
  
  let b2Auth = {}

  const init = (params) => {
    b2Auth.applicationKeyId = _.get(params, 'applicationKeyId')
    b2Auth.applicationKey = _.get(params, 'applicationKey')
    b2Auth.bucketId = _.get(params, 'bucketId')
  }

  const upload = async function(params, cb) {
    const url = _.get(params, 'url')
    const fileName = _.get(params, 'fileName')
    const bucketId = _.get(b2Auth, 'bucketId') 

    const b2 = new B2(b2Auth)
    await b2.authorize()

    const multipartUploadThreshold = (5 * 1024 * 1024)
    const partSize = 5 * 1024 * 1024

    let contentLength
    let contentType
    let parts = []
    let fileId
    let classicUpload = false

    async.series({
      headObject: (done) => {
        axios.head(url)
        .then(response => {
          contentLength = _.get(response, 'headers.content-length')
          contentType = _.get(response, 'headers.content-type')
          return done()
        })
        .catch(done)
      },
      startClassicUpload: (done) => {
        if (contentLength > multipartUploadThreshold) return done()
        classicUpload = true
        b2.getUploadUrl({
          bucketId
        })
        .then(response => {
          let uploadUrl = response.data.uploadUrl;
          let authToken = response.data.authorizationToken;

          axios.get(url).then(response => {
            b2.uploadFile({
              uploadUrl,
              uploadAuthToken: authToken,
              fileName,
              contentLength,
              mime: contentType,
              data: response.data
            })
            .then(done)
            .catch(done)
          })
          .catch(done)
        })
        .catch(done)
      },
      initUpload: (done) => {
        if (classicUpload) return done()
        b2.startLargeFile({ bucketId, fileName }).then(response => {
          fileId = response.data.fileId
          return done()
        }).catch(done)
      },
      startUploadingParts: (done) => {
        if (classicUpload) return done()

        let rangeStart = 0
        let partNumber = 1

        async.whilst(
          (callback) => { return callback(null, rangeStart < contentLength) },
          (callback) => {
            let range =  'bytes=' + rangeStart + '-' + (rangeStart + partSize)
            // console.log('Request range', range)

            axios({
              method: 'get',
              url,
              responseType: 'arraybuffer',
              headers: {
                'Range': range
              }
            })            
          .then( (res) => {
            rangeStart += res.data.length

            // upload that part
            b2.getUploadPartUrl({ fileId })
              .then(response => {
                let uploadUrl = response.data.uploadUrl;
                let authToken = response.data.authorizationToken;
                
                b2.uploadPart({
                  partNumber,
                  uploadUrl,
                  uploadAuthToken: authToken,
                  data: res.data
                })
                .then(part => {
                  parts.push(part.data)
                  partNumber += 1
                  return callback()                
                })
                .catch(callback)
              })
              .catch(callback)
            })
          },
          done)
      },
      finishUpload: (done) => {
        if (classicUpload) return done()

        b2.finishLargeFile({
          fileId,
          partSha1Array: _.map(parts, 'contentSha1')
        })
        .then(response => {
          return done(null, response.data)
        })
        .catch(done)
      }
    }, cb)
  }

  return {
    init,
    upload
  }
}

module.exports = acb2()


