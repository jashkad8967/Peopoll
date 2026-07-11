const { withGradleProperties } = require('expo/config-plugins');

function withR8GradleProperties(config) {
  return withGradleProperties(config, (props) => {
    props.modResults = props.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'android.r8.optimizedResourceShrinking')
    );

    props.modResults.push({
      type: 'property',
      key: 'android.r8.optimizedResourceShrinking',
      value: 'true',
    });

    return props;
  });
}

module.exports = withR8GradleProperties;
